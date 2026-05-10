import {
  DryRunLiveKitMediaAdapter,
  type LiveKitMediaAdapter,
  type LiveKitTranslatedAudioPublisher,
  type PcmAudioFrame,
} from "@/server/translation/livekit-media-adapter";
import { LiveKitNodeMediaAdapter } from "@/server/translation/livekit-node-media-adapter";
import { connectOpenAIRealtimeWebSocket } from "@/server/translation/openai-realtime-ws";
import {
  pumpRealtimeTranslation,
  type RealtimeJsonConnectionFactory,
} from "@/server/translation/realtime-audio-pump";
import { logOperationalEvent } from "@/server/observability/events";
import { publishTranslationStatus } from "@/server/translation/livekit-status";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import {
  buildOpenAIRealtimeWebSocketRequest,
  type OpenAIRealtimeWebSocketRequest,
} from "@/server/translation/openai-realtime-adapter";
import {
  SupabaseTranslationSessionRepository,
  type TranslationSessionRepository,
} from "@/server/translation/session-repository";
import { ServerTranscriptBuffer } from "@/server/translation/server-transcript-buffer";
import { persistServerTranscriptSegment } from "@/server/translation/server-transcript-persistence";
import {
  REALTIME_PCM_FORMAT,
  describeRealtimePcmFormat,
} from "@/server/translation/audio-format";
import type {
  TranslationBridge,
  TranslationBridgeStartRequest,
  TranslationBridgeStatus,
} from "@/server/translation/bridge";
import { getServerEnv } from "@/lib/env";

export type ServerRealtimeTranslationBridgeOptions = {
  liveKit?: LiveKitMediaAdapter;
  realtimeRequestFactory?: () => OpenAIRealtimeWebSocketRequest;
  realtimeConnectionFactory?: RealtimeJsonConnectionFactory;
  statusUpdater?: Pick<TranslationSessionRepository, "updateStatus">;
  heartbeatIntervalMs?: number;
  dryRun?: boolean;
};

const DEFAULT_MEDIA_PUMP_HEARTBEAT_MS = 15_000;

/**
 * Runtime bridge boundary for one LiveKit mic track -> one OpenAI Realtime session
 * -> one LiveKit translated audio track.
 *
 * The no-dependency implementation currently performs all deterministic setup and
 * status reporting. Actual PCM frame pump/resampling/publication is intentionally
 * isolated behind adapters so production can swap in LiveKit Agents or a dedicated
 * WebRTC-capable worker runtime without moving media loops into Next.js routes.
 */
export class ServerRealtimeTranslationBridge implements TranslationBridge {
  private readonly liveKit: LiveKitMediaAdapter;
  private readonly realtimeRequestFactory: () => OpenAIRealtimeWebSocketRequest;
  private readonly realtimeConnectionFactory?: RealtimeJsonConnectionFactory;
  private readonly statusUpdater: Pick<TranslationSessionRepository, "updateStatus">;
  private readonly heartbeatIntervalMs: number;
  private readonly dryRun: boolean;

  constructor(options: ServerRealtimeTranslationBridgeOptions = {}) {
    const env = getServerEnv();
    const liveKitNodeEnabled = env.TRANSLATION_WORKER_ADAPTER === "livekit-node";
    this.liveKit = options.liveKit ?? (liveKitNodeEnabled ? new LiveKitNodeMediaAdapter() : new DryRunLiveKitMediaAdapter());
    this.realtimeRequestFactory = options.realtimeRequestFactory ?? buildOpenAIRealtimeWebSocketRequest;
    this.realtimeConnectionFactory = options.realtimeConnectionFactory ?? (liveKitNodeEnabled ? connectOpenAIRealtimeWebSocket : undefined);
    this.statusUpdater = options.statusUpdater ?? new SupabaseTranslationSessionRepository();
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_MEDIA_PUMP_HEARTBEAT_MS;
    this.dryRun = options.dryRun ?? env.TRANSLATION_WORKER_DRY_RUN === "true";
  }

  async start(request: TranslationBridgeStartRequest): Promise<TranslationBridgeStatus> {
    let source: Awaited<ReturnType<LiveKitMediaAdapter["subscribeToParticipantMicrophone"]>>;
    let realtimeRequest: OpenAIRealtimeWebSocketRequest;

    try {
      await this.liveKit.attachToRoom(request);
      source = await this.liveKit.subscribeToParticipantMicrophone(request);
      realtimeRequest = this.realtimeRequestFactory();
    } catch (error) {
      await this.liveKit.close?.().catch(() => undefined);
      throw error;
    }

    if (this.dryRun) {
      const dryRunPublisher = await this.liveKit.createTranslatedAudioPublisher(request, REALTIME_PCM_FORMAT);
      await dryRunPublisher.close?.().catch(() => undefined);
      await this.liveKit.close?.().catch(() => undefined);
      return {
        status: "connected",
        message: [
          `Dry-run bridge attached to ${source.participantIdentity} microphone.`,
          `Realtime URL prepared: ${redactRealtimeUrl(realtimeRequest.url)}.`,
          `Audio boundary: ${describeRealtimePcmFormat(dryRunPublisher.format)}.`,
          `Target track: ${dryRunPublisher.trackName}.`,
        ].join(" "),
      };
    }

    if (!source.frames) {
      await this.liveKit.close?.().catch(() => undefined);
      return {
        status: "failed",
        message:
          "LiveKit media adapter is not production-capable. It must expose microphone PCM frames before live media forwarding can start.",
      };
    }

    if (!this.realtimeConnectionFactory) {
      await this.liveKit.close?.().catch(() => undefined);
      return {
        status: "failed",
        message:
          "OpenAI realtime WebSocket transport is not configured for the server worker. Provide a RealtimeJsonConnectionFactory backed by a Node WebSocket implementation.",
      };
    }

    const translatedAudioPublisher = createLazyTranslatedAudioPublisher(this.liveKit, request);

    let markReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const transcriptBuffer = new ServerTranscriptBuffer(request.sourceLanguage, request.targetLanguage);
    let firstOutputAudioReceived = false;
    const pumpTask = pumpRealtimeTranslation({
      request: realtimeRequest,
      connect: this.realtimeConnectionFactory,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      inputTranscriptionModel: getServerEnv().OPENAI_TRANSCRIPTION_MODEL,
      sourceFrames: source.frames,
      publishFrame: translatedAudioPublisher.publishFrame,
      shouldContinue: createSessionContinuationGuard(request.sessionId),
      onReady: markReady,
      onTranscript: async (event) => {
        const segment = transcriptBuffer.push(event);
        if (segment) {
          await persistServerTranscriptSegment({ request, segment }).catch(() => undefined);
        }
      },
      onFirstOutputAudio: async () => {
        firstOutputAudioReceived = true;
        await this.statusUpdater.updateStatus(request.sessionId, "connected", { heartbeat: true }).catch(() => undefined);
        await publishServerTranslationStatus(request, "connected", "Server translation produced audible output.");
        await logOperationalEvent({
          meetingId: request.meetingId,
          roomName: request.livekitRoomName,
          featureArea: "translation",
          eventType: "translation_first_audio_output",
          severity: "info",
          message: "Server translation produced its first audible output frame.",
          metadata: { sessionId: request.sessionId, targetLanguage: request.targetLanguage },
        }).catch(() => undefined);
      },
    });

    try {
      await Promise.race([
        ready,
        pumpTask.then(() => undefined),
      ]);
    } catch (error) {
      await translatedAudioPublisher.close();
      await this.liveKit.close?.();
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "Realtime media pump failed before it became ready.",
      };
    }

    const heartbeatTimer = setInterval(() => {
      const status = firstOutputAudioReceived ? "connected" : "starting";
      void this.statusUpdater.updateStatus(request.sessionId, status, { heartbeat: true }).catch(() => undefined);
    }, this.heartbeatIntervalMs);

    void pumpTask
      .then(async (summary) => {
        await this.statusUpdater.updateStatus(request.sessionId, "stopped", { heartbeat: true }).catch(() => undefined);
        await publishServerTranslationStatus(request, "stopped", "Server translation media pump stopped.");
        await logOperationalEvent({
          meetingId: request.meetingId,
          roomName: request.livekitRoomName,
          featureArea: "translation",
          eventType: "translation_media_pump_stopped",
          severity: "info",
          message: `Server translation media pump stopped after ${summary.inputFrames} input frame(s), ${summary.outputFrames} output frame(s), and ${summary.transcriptEvents} transcript event(s).`,
          metadata: { sessionId: request.sessionId, targetLanguage: request.targetLanguage },
        });
      })
      .catch(async (error) => {
        await this.statusUpdater
          .updateStatus(request.sessionId, "failed", {
            error: error instanceof Error ? error.message : "Server translation media pump failed.",
            heartbeat: true,
          })
          .catch(() => undefined);
        await publishServerTranslationStatus(
          request,
          "failed",
          error instanceof Error ? error.message : "Server translation media pump failed.",
        );
        await logOperationalEvent({
          meetingId: request.meetingId,
          roomName: request.livekitRoomName,
          featureArea: "translation",
          eventType: "translation_media_pump_failed",
          severity: "error",
          errorType: error instanceof Error ? error.name : "unknown_error",
          message: error instanceof Error ? error.message : "Server translation media pump failed.",
          metadata: { sessionId: request.sessionId, targetLanguage: request.targetLanguage },
        });
      })
      .finally(async () => {
        clearInterval(heartbeatTimer);
        await translatedAudioPublisher.close().catch(() => undefined);
        await this.liveKit.close?.().catch(() => undefined);
      });

    return {
      status: "starting",
      message: `Server translation media pump is ready for ${request.sourceLanguage} → ${request.targetLanguage}; waiting for first translated audio.`,
    };
  }

  async stop(): Promise<TranslationBridgeStatus> {
    await this.liveKit.close?.();
    return { status: "stopped", message: "Translation bridge stopped." };
  }
}



async function publishServerTranslationStatus(
  request: TranslationBridgeStartRequest,
  status: "connected" | "stopped" | "failed",
  message: string,
) {
  await publishTranslationStatus(request.livekitRoomName, {
    type: "translation_status",
    meetingId: request.meetingId,
    status,
    message,
    sourceIdentity: request.sourceParticipantIdentity,
    targetLanguage: request.targetLanguage,
    occurredAt: new Date().toISOString(),
  }).catch(() => undefined);
}

function createLazyTranslatedAudioPublisher(liveKit: LiveKitMediaAdapter, request: TranslationBridgeStartRequest) {
  let publisher: LiveKitTranslatedAudioPublisher | undefined;
  let publisherPromise: Promise<LiveKitTranslatedAudioPublisher> | undefined;

  async function getPublisher() {
    publisherPromise ??= liveKit.createTranslatedAudioPublisher(request, REALTIME_PCM_FORMAT);
    publisher = await publisherPromise;
    if (!publisher.publishFrame) {
      throw new Error(
        "LiveKit media adapter is not production-capable. It must expose a translated-audio publisher before live media forwarding can start.",
      );
    }
    return publisher;
  }

  return {
    publishFrame: async (frame: PcmAudioFrame) => {
      const readyPublisher = await getPublisher();
      await readyPublisher.publishFrame?.(frame);
    },
    close: async () => {
      const readyPublisher = publisher ?? (await publisherPromise?.catch(() => undefined));
      await readyPublisher?.close?.();
    },
  };
}

function redactRealtimeUrl(url: string) {
  return url.replace(/model=([^&]+)/, "model=<env>");
}

function createSessionContinuationGuard(sessionId: string) {
  let nextCheckAt = 0;

  return async () => {
    const now = Date.now();
    if (now < nextCheckAt) return true;
    nextCheckAt = now + 2_000;

    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from("rt_translation_sessions")
        .select("status")
        .eq("id", sessionId)
        .maybeSingle<{ status: string }>();

      return !["stopped", "failed"].includes(data?.status ?? "");
    } catch {
      return true;
    }
  };
}
