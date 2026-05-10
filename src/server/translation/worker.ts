import { randomUUID } from "crypto";
import type { TranslationBridge, TranslationBridgeStatus } from "@/server/translation/bridge";
import { ServerRealtimeTranslationBridge } from "@/server/translation/livekit-openai-bridge";
import {
  SupabaseTranslationSessionRepository,
  type TranslationSessionRecord,
  type TranslationSessionRepository,
} from "@/server/translation/session-repository";
import { logOperationalEvent } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { publishTranslationStatus } from "@/server/translation/livekit-status";
import { validateTranslationSessionPreflight } from "@/server/translation/session-preflight";

export type TranslationWorkerOptions = {
  workerId?: string;
  repository?: TranslationSessionRepository;
  bridge?: TranslationBridge;
  bridgeFactory?: () => TranslationBridge;
  publishStatus?: typeof publishTranslationStatus;
  validateSession?: typeof validateTranslationSessionPreflight;
};

export type TranslationWorkerRunResult =
  | { processed: false; reason: "no-session" }
  | { processed: true; sessionId: string; status: TranslationBridgeStatus["status"] };

export class TranslationWorker {
  private readonly workerId: string;
  private readonly repository: TranslationSessionRepository;
  private readonly bridgeFactory: () => TranslationBridge;
  private readonly publishStatus: typeof publishTranslationStatus;
  private readonly validateSession: typeof validateTranslationSessionPreflight;

  constructor(options: TranslationWorkerOptions = {}) {
    this.workerId = options.workerId ?? `translation-worker-${randomUUID()}`;
    this.repository = options.repository ?? new SupabaseTranslationSessionRepository();
    this.bridgeFactory = options.bridgeFactory ?? (() => options.bridge ?? new ServerRealtimeTranslationBridge());
    this.publishStatus = options.publishStatus ?? publishTranslationStatus;
    this.validateSession = options.validateSession ?? validateTranslationSessionPreflight;
  }

  async runOnce(): Promise<TranslationWorkerRunResult> {
    const session = await this.repository.claimNext(this.workerId);

    if (!session) {
      return { processed: false, reason: "no-session" };
    }

    await this.emit(session, "starting", "Translation worker claimed session.");

    const preflight = await this.validateSession(session);
    if (!preflight.ok) {
      await this.repository.updateStatus(session.sessionId, "failed", { error: preflight.message, heartbeat: true });
      await this.emit(session, "failed", preflight.message);
      await this.recordSessionObservability(session, "failed", preflight.message, preflight.reason);

      return { processed: true, sessionId: session.sessionId, status: "failed" };
    }

    try {
      const bridge = this.bridgeFactory();
      const bridgeStatus = await bridge.start(session);
      await this.repository.updateStatus(session.sessionId, bridgeStatus.status, {
        error: bridgeStatus.status === "failed" ? bridgeStatus.message : undefined,
        heartbeat: true,
      });
      await this.emit(session, bridgeStatus.status, bridgeStatus.message);
      await this.recordSessionObservability(session, bridgeStatus.status, bridgeStatus.message);

      return { processed: true, sessionId: session.sessionId, status: bridgeStatus.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Translation bridge failed.";
      await this.repository.updateStatus(session.sessionId, "failed", { error: message, heartbeat: true });
      await this.emit(session, "failed", message);
      await this.recordSessionObservability(session, "failed", message);

      return { processed: true, sessionId: session.sessionId, status: "failed" };
    }
  }

  private async recordSessionObservability(
    session: TranslationSessionRecord,
    status: TranslationBridgeStatus["status"],
    message?: string,
    reason?: string,
  ) {
    try {
      const admin = createSupabaseAdminClient();
      await logOperationalEvent({
        supabase: admin,
        meetingId: session.meetingId,
        roomName: session.livekitRoomName,
        featureArea: "translation",
        eventType: status === "failed" ? "translation_worker_failed" : "translation_worker_status",
        severity: status === "failed" ? "error" : "info",
        errorType: status === "failed" ? "translation_bridge_error" : null,
        message,
        metadata: {
          sessionId: session.sessionId,
          sourceIdentity: session.sourceParticipantIdentity,
          targetLanguage: session.targetLanguage,
          workerId: this.workerId,
          reason,
        },
      });
      await recordUsageSnapshot({
        supabase: admin,
        meetingId: session.meetingId,
        reason: "translation_update",
        metadata: { sessionId: session.sessionId, status },
      });
    } catch {
      // Observability must never break translation worker processing.
    }
  }

  private async emit(
    session: TranslationSessionRecord,
    status: TranslationBridgeStatus["status"],
    message?: string,
  ) {
    await Promise.resolve(
      this.publishStatus(session.livekitRoomName, {
        type: "translation_status",
        meetingId: session.meetingId,
        status,
        message,
        sourceIdentity: session.sourceParticipantIdentity,
        targetLanguage: session.targetLanguage,
        occurredAt: new Date().toISOString(),
      }),
    ).catch(() => undefined);
  }
}
