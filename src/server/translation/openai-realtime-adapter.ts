import { requireEnv } from "@/lib/env";
import { getRealtimeWebSocketUrl } from "@/server/translation/realtime";

export type OpenAIRealtimeWebSocketRequest = {
  url: string;
  headers: Record<string, string>;
};

export type RealtimeAudioDeltaEvent = {
  type: "audio_delta";
  base64Audio: string;
  rawType: string;
};

export type RealtimeTranscriptEvent = {
  type: "transcript";
  text: string;
  rawType: string;
};

export type RealtimeErrorEvent = {
  type: "error";
  message: string;
  rawType?: string;
};

export type RealtimeSessionUpdatedEvent = {
  type: "session_updated";
  rawType: "session.updated";
};

export type RealtimeUnknownEvent = {
  type: "unknown";
  rawType?: string;
};

export type ParsedRealtimeEvent =
  | RealtimeAudioDeltaEvent
  | RealtimeTranscriptEvent
  | RealtimeErrorEvent
  | RealtimeSessionUpdatedEvent
  | RealtimeUnknownEvent;

export function buildOpenAIRealtimeWebSocketRequest(): OpenAIRealtimeWebSocketRequest {
  return {
    url: getRealtimeWebSocketUrl(),
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
    },
  };
}

export function parseRealtimeEvent(event: unknown): ParsedRealtimeEvent {
  if (!event || typeof event !== "object") {
    return { type: "unknown" };
  }

  const payload = event as Record<string, unknown>;
  const rawType = typeof payload.type === "string" ? payload.type : undefined;

  if (rawType === "error") {
    return { type: "error", message: extractRealtimeErrorMessage(payload), rawType };
  }

  if (rawType === "session.updated") {
    return { type: "session_updated", rawType };
  }

  if (rawType === "response.done" && isFailedRealtimeResponse(payload.response)) {
    return { type: "error", message: extractRealtimeErrorMessage(payload.response), rawType };
  }

  if (
    (rawType === "session.output_audio.delta" ||
      rawType === "response.output_audio.delta" ||
      rawType === "response.audio.delta") &&
    typeof payload.delta === "string"
  ) {
    return { type: "audio_delta", base64Audio: payload.delta, rawType };
  }

  if (
    (rawType === "session.output_transcript.delta" ||
      rawType === "session.input_transcript.delta" ||
      rawType === "response.output_audio_transcript.delta" ||
      rawType === "response.audio_transcript.delta" ||
      rawType === "response.output_text.delta" ||
      rawType === "conversation.item.input_audio_transcription.delta") &&
    typeof payload.delta === "string"
  ) {
    return { type: "transcript", text: payload.delta, rawType };
  }

  if (rawType === "conversation.item.input_audio_transcription.completed") {
    const transcript = payload.transcript;
    return {
      type: "transcript",
      text: typeof transcript === "string" ? transcript : "",
      rawType,
    };
  }

  return { type: "unknown", rawType };
}

function isFailedRealtimeResponse(response: unknown) {
  if (!response || typeof response !== "object") return false;
  const status = (response as Record<string, unknown>).status;
  return status === "failed" || status === "cancelled" || status === "incomplete";
}

function extractRealtimeErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "OpenAI realtime session returned an error.";
  }

  const record = payload as Record<string, unknown>;
  const directMessage = record.message;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage;
  }

  const error = record.error;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const errorMessage = errorRecord.message;
    if (typeof errorMessage === "string" && errorMessage.trim()) {
      return errorMessage;
    }
  }

  const statusDetails = record.status_details;
  if (statusDetails && typeof statusDetails === "object") {
    const statusDetailsRecord = statusDetails as Record<string, unknown>;
    const detailsError = statusDetailsRecord.error;
    if (detailsError && typeof detailsError === "object") {
      const detailsErrorMessage = (detailsError as Record<string, unknown>).message;
      if (typeof detailsErrorMessage === "string" && detailsErrorMessage.trim()) {
        return detailsErrorMessage;
      }
    }
  }

  return "OpenAI realtime session returned an error.";
}
