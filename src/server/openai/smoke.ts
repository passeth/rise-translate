import { getServerEnv, requireEnv } from "@/lib/env";
import { buildSessionUpdate, buildTranslationClientSecretRequest } from "@/lib/realtime-translation-config";
import { buildOpenAIRealtimeWebSocketRequest } from "@/server/translation/openai-realtime-adapter";
import { connectOpenAIRealtimeWebSocket } from "@/server/translation/openai-realtime-ws";
import type { RealtimeJsonConnectionFactory } from "@/server/translation/realtime-audio-pump";

export type OpenAISmokeResult = {
  translationModel: string;
  transcriptionModel: string;
  notesModel: string;
  visibleModelCount: number;
  checkedModels: string[];
  realtimeTranslationClientSecret: {
    created: true;
    sessionType: string;
  };
  realtimeTranslationWebSocket: {
    sessionUpdated: true;
  };
};

type FetchLike = typeof fetch;

export async function smokeOpenAIAuth(
  fetchImpl: FetchLike = fetch,
  connectRealtime: RealtimeJsonConnectionFactory = connectOpenAIRealtimeWebSocket,
): Promise<OpenAISmokeResult> {
  const env = getServerEnv();
  const apiKey = requireEnv("OPENAI_API_KEY");
  const response = await fetchImpl("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI auth smoke failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as { data?: Array<{ id?: string }> };
  const modelIds = new Set((payload.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id)));
  const configuredModels = [
    env.OPENAI_TRANSLATION_MODEL,
    env.OPENAI_NOTES_MODEL?.trim() || "gpt-4.1-mini",
  ];
  const missing = configuredModels.filter((model) => !modelIds.has(model));

  if (missing.length > 0) {
    throw new Error(`OpenAI auth smoke succeeded, but configured model(s) are not visible: ${missing.join(", ")}.`);
  }

  const realtimeClientSecret = await createRealtimeTranslationClientSecret({
    apiKey,
    fetchImpl,
    translationModel: env.OPENAI_TRANSLATION_MODEL,
    transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
  });
  const realtimeWebSocket = await updateRealtimeTranslationWebSocketSession({
    connectRealtime,
    transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
  });

  return {
    translationModel: env.OPENAI_TRANSLATION_MODEL,
    transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
    notesModel: env.OPENAI_NOTES_MODEL?.trim() || "gpt-4.1-mini",
    visibleModelCount: modelIds.size,
    checkedModels: configuredModels,
    realtimeTranslationClientSecret: realtimeClientSecret,
    realtimeTranslationWebSocket: realtimeWebSocket,
  };
}

async function createRealtimeTranslationClientSecret({
  apiKey,
  fetchImpl,
  translationModel,
  transcriptionModel,
}: {
  apiKey: string;
  fetchImpl: FetchLike;
  translationModel: string;
  transcriptionModel: string;
}): Promise<OpenAISmokeResult["realtimeTranslationClientSecret"]> {
  const request = buildTranslationClientSecretRequest({
    apiKey,
    language: "en",
    sourceLanguage: "ko",
    inputTranscriptionEnabled: true,
    inputTranscriptionModel: transcriptionModel,
    noiseReductionEnabled: true,
    model: translationModel,
  });
  const response = await fetchImpl(request.url, {
    ...request.init,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI realtime translation client-secret smoke failed with HTTP ${response.status}: ${await readOpenAIError(response)}.`,
    );
  }

  const payload = await response.json() as { value?: string; session?: { type?: string } };
  if (!payload.value || payload.session?.type !== "translation") {
    throw new Error("OpenAI realtime translation client-secret smoke returned an unexpected response shape.");
  }

  return {
    created: true,
    sessionType: payload.session.type,
  };
}

async function readOpenAIError(response: Response) {
  try {
    const payload = await response.json() as { error?: { message?: string; param?: string; code?: string } };
    return [payload.error?.message, payload.error?.param ? `param=${payload.error.param}` : undefined, payload.error?.code]
      .filter(Boolean)
      .join(" ");
  } catch {
    return "Unable to parse error response";
  }
}

async function updateRealtimeTranslationWebSocketSession({
  connectRealtime,
  transcriptionModel,
}: {
  connectRealtime: RealtimeJsonConnectionFactory;
  transcriptionModel: string;
}): Promise<OpenAISmokeResult["realtimeTranslationWebSocket"]> {
  const connection = await connectRealtime(buildOpenAIRealtimeWebSocketRequest());

  try {
    await connection.sendJson(
      buildSessionUpdate({
        language: "en",
        sourceLanguage: "ko",
        inputTranscriptionEnabled: true,
        inputTranscriptionModel: transcriptionModel,
        noiseReductionEnabled: true,
      }),
    );
    await waitForRealtimeSessionUpdated(connection.events);
    return { sessionUpdated: true };
  } finally {
    await connection.close();
  }
}

async function waitForRealtimeSessionUpdated(events: AsyncIterable<unknown>) {
  await Promise.race([
    (async () => {
      for await (const event of events) {
        const payload = event && typeof event === "object" ? event as Record<string, unknown> : {};
        if (payload.type === "session.updated") return;
        if (payload.type === "error") {
          throw new Error(`OpenAI realtime translation WebSocket smoke failed: ${extractRealtimeError(payload)}.`);
        }
      }
      throw new Error("OpenAI realtime translation WebSocket smoke ended before session.updated.");
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OpenAI realtime translation WebSocket smoke timed out.")), 10_000),
    ),
  ]);
}

function extractRealtimeError(payload: Record<string, unknown>) {
  const directMessage = payload.message;
  if (typeof directMessage === "string" && directMessage.trim()) return directMessage;
  const error = payload.error;
  if (error && typeof error === "object") {
    const errorMessage = (error as Record<string, unknown>).message;
    if (typeof errorMessage === "string" && errorMessage.trim()) return errorMessage;
  }
  return "OpenAI realtime session returned an error";
}
