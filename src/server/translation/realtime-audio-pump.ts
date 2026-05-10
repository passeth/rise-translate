import { buildSessionUpdate } from "@/lib/realtime-translation-config";
import type { OpenAIRealtimeWebSocketRequest } from "@/server/translation/openai-realtime-adapter";
import { parseRealtimeEvent, type RealtimeTranscriptEvent } from "@/server/translation/openai-realtime-adapter";
import type { PcmAudioFrame } from "@/server/translation/livekit-media-adapter";

export type RealtimeJsonConnection = {
  sendJson: (event: Record<string, unknown>) => Promise<void>;
  events: AsyncIterable<unknown>;
  close: () => Promise<void>;
};

export type RealtimeJsonConnectionFactory = (
  request: OpenAIRealtimeWebSocketRequest,
) => Promise<RealtimeJsonConnection>;

export type RealtimeTranslationPumpInput = {
  request: OpenAIRealtimeWebSocketRequest;
  connect: RealtimeJsonConnectionFactory;
  sourceLanguage: string;
  targetLanguage: string;
  inputTranscriptionModel?: string;
  sourceFrames: AsyncIterable<PcmAudioFrame>;
  publishFrame: (frame: PcmAudioFrame) => Promise<void>;
  shouldContinue?: () => boolean | Promise<boolean>;
  onReady?: () => void | Promise<void>;
  onTranscript?: (event: RealtimeTranscriptEvent) => void | Promise<void>;
  onFirstOutputAudio?: () => void | Promise<void>;
  manualCommitOnSourceEnd?: boolean;
};

export type RealtimeTranslationPumpSummary = {
  inputFrames: number;
  outputFrames: number;
  transcriptEvents: number;
};

const SESSION_UPDATE_TIMEOUT_MS = 10_000;

export async function pumpRealtimeTranslation({
  request,
  connect,
  sourceLanguage,
  targetLanguage,
  inputTranscriptionModel,
  sourceFrames,
  publishFrame,
  shouldContinue,
  onReady,
  onTranscript,
  onFirstOutputAudio,
  manualCommitOnSourceEnd = false,
}: RealtimeTranslationPumpInput): Promise<RealtimeTranslationPumpSummary> {
  const connection = await connect(request);
  const summary: RealtimeTranslationPumpSummary = {
    inputFrames: 0,
    outputFrames: 0,
    transcriptEvents: 0,
  };
  let outputError: unknown;
  let signalOutputFailure: (error: unknown) => void = () => undefined;
  const outputFailure = new Promise<{ type: "output_failure"; error: unknown }>((resolve) => {
    signalOutputFailure = (error) => resolve({ type: "output_failure", error });
  });
  let signalSessionUpdated: () => void = () => undefined;
  const sessionUpdated = new Promise<{ type: "session_updated" }>((resolve) => {
    signalSessionUpdated = () => resolve({ type: "session_updated" });
  });

  const outputTask = consumeRealtimeEvents(
    connection.events,
    summary,
    publishFrame,
    onTranscript,
    onFirstOutputAudio,
    signalSessionUpdated,
  ).catch((error) => {
    outputError = error;
    signalOutputFailure(error);
  });
  const sourceIterator = sourceFrames[Symbol.asyncIterator]();
  let sourceDone = false;

  try {
    await connection.sendJson(
      buildSessionUpdate({
        language: targetLanguage,
        sourceLanguage,
        inputTranscriptionEnabled: true,
        inputTranscriptionModel,
        noiseReductionEnabled: true,
      }),
    );
    await waitForSessionUpdated(sessionUpdated, outputFailure);
    await onReady?.();

    while (true) {
      if (outputError) {
        break;
      }
      if (shouldContinue && !(await shouldContinue())) {
        break;
      }
      const nextFrame = sourceIterator.next().then((result) => ({
        type: "source_frame" as const,
        result,
      }));
      const next = await Promise.race([nextFrame, outputFailure]);
      if (next.type === "output_failure") {
        outputError = next.error;
        break;
      }
      if (next.result.done) {
        sourceDone = true;
        break;
      }
      const frame = next.result.value;
      await connection.sendJson({
        type: "input_audio_buffer.append",
        audio: encodePcm16Frame(frame),
      });
      summary.inputFrames += 1;
    }

    // With server VAD enabled, OpenAI commits speech turns automatically.
    // Manual commits are kept opt-in for future non-VAD modes because committing
    // an empty/already-auto-committed buffer can fail during normal shutdown.
    if (!outputError && manualCommitOnSourceEnd) {
      await connection.sendJson({ type: "input_audio_buffer.commit" });
    }
  } finally {
    if (!sourceDone) {
      void sourceIterator.return?.().catch(() => undefined);
    }
    await connection.close();
  }

  await outputTask;
  if (outputError) {
    throw outputError;
  }
  return summary;
}

async function consumeRealtimeEvents(
  events: AsyncIterable<unknown>,
  summary: RealtimeTranslationPumpSummary,
  publishFrame: (frame: PcmAudioFrame) => Promise<void>,
  onTranscript?: (event: RealtimeTranscriptEvent) => void | Promise<void>,
  onFirstOutputAudio?: () => void | Promise<void>,
  onSessionUpdated?: () => void,
) {
  let firstOutputAudioReported = false;
  for await (const event of events) {
    const parsed = parseRealtimeEvent(event);

    if (parsed.type === "error") {
      throw new Error(parsed.message);
    }

    if (parsed.type === "session_updated") {
      onSessionUpdated?.();
      continue;
    }

    if (parsed.type === "audio_delta") {
      if (!firstOutputAudioReported) {
        firstOutputAudioReported = true;
        await onFirstOutputAudio?.();
      }
      await publishFrame(decodePcm16Frame(parsed.base64Audio));
      summary.outputFrames += 1;
      continue;
    }

    if (parsed.type === "transcript" && parsed.text) {
      await onTranscript?.(parsed);
      summary.transcriptEvents += 1;
    }
  }
}

async function waitForSessionUpdated(
  sessionUpdated: Promise<{ type: "session_updated" }>,
  outputFailure: Promise<{ type: "output_failure"; error: unknown }>,
) {
  const timeout = new Promise<{ type: "timeout" }>((resolve) => {
    setTimeout(() => resolve({ type: "timeout" }), SESSION_UPDATE_TIMEOUT_MS);
  });
  const result = await Promise.race([sessionUpdated, outputFailure, timeout]);

  if (result.type === "output_failure") {
    throw result.error;
  }
  if (result.type === "timeout") {
    throw new Error("OpenAI realtime session update was not acknowledged before audio forwarding.");
  }
}

export function encodePcm16Frame(frame: PcmAudioFrame) {
  return Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength).toString("base64");
}

export function decodePcm16Frame(base64Audio: string): PcmAudioFrame {
  const bytes = Buffer.from(base64Audio, "base64");
  const data = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return {
    data,
    sampleRate: 24_000,
    channels: 1,
    samplesPerChannel: data.length,
  };
}
