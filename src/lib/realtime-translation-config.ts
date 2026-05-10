import { SUPPORTED_LANGUAGES, isSupportedLanguage, type SupportedLanguageCode } from "@/lib/languages";

export const DEFAULT_TRANSLATION_MODEL = "gpt-realtime-translate";
export const DEFAULT_INPUT_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
export const REALTIME_TRANSLATION_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/translations/client_secrets";
export const REALTIME_TRANSLATION_CALL_URL = "https://api.openai.com/v1/realtime/translations/calls";

const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/;

export type RealtimeTranslationClientSecretRequest = {
  url: string;
  init: RequestInit;
};

export function normalizeTranslationLanguage(language: string): SupportedLanguageCode {
  const normalized = language.trim().toLowerCase();
  if (!LANGUAGE_PATTERN.test(normalized) || !isSupportedLanguage(normalized)) {
    throw new Error("Unsupported translation language");
  }

  return normalized;
}

export function buildTranslationSessionConfig({
  language,
  inputTranscriptionEnabled,
  inputTranscriptionModel = DEFAULT_INPUT_TRANSCRIPTION_MODEL,
  noiseReductionEnabled,
  model = DEFAULT_TRANSLATION_MODEL,
}: {
  language: string;
  // Realtime Translation does not accept a source-language field in the session payload.
  // Direction is enforced by per-speaker LiveKit tracks; OpenAI detects the source audio language.
  sourceLanguage?: string;
  inputTranscriptionEnabled: boolean;
  inputTranscriptionModel?: string;
  noiseReductionEnabled: boolean;
  model?: string;
}) {
  const targetLanguage = normalizeTranslationLanguage(language);

  return {
    model,
    audio: {
      input: {
        ...(inputTranscriptionEnabled
          ? {
              transcription: {
                model: inputTranscriptionModel,
              },
            }
          : {}),
        noise_reduction: noiseReductionEnabled ? { type: "far_field" } : null,
      },
      output: {
        language: targetLanguage,
      },
    },
  };
}

export function buildSessionUpdate({
  language,
  sourceLanguage,
  inputTranscriptionEnabled,
  inputTranscriptionModel,
  noiseReductionEnabled,
}: {
  language: string;
  sourceLanguage?: string;
  inputTranscriptionEnabled: boolean;
  inputTranscriptionModel?: string;
  noiseReductionEnabled: boolean;
}) {
  const session = buildTranslationSessionConfig({
    language,
    sourceLanguage,
    inputTranscriptionEnabled,
    inputTranscriptionModel,
    noiseReductionEnabled,
  });
  const sessionWithoutModel: Omit<typeof session, "model"> & { model?: string } = { ...session };
  delete sessionWithoutModel.model;

  return {
    type: "session.update",
    session: sessionWithoutModel,
  };
}

export function buildTranslationClientSecretRequest({
  apiKey,
  language,
  sourceLanguage,
  inputTranscriptionEnabled,
  inputTranscriptionModel,
  noiseReductionEnabled,
  model = DEFAULT_TRANSLATION_MODEL,
}: {
  apiKey: string;
  language: string;
  sourceLanguage?: string;
  inputTranscriptionEnabled: boolean;
  inputTranscriptionModel?: string;
  noiseReductionEnabled: boolean;
  model?: string;
}): RealtimeTranslationClientSecretRequest {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  return {
    url: REALTIME_TRANSLATION_CLIENT_SECRET_URL,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: buildTranslationSessionConfig({
          language,
          sourceLanguage,
          inputTranscriptionEnabled,
          inputTranscriptionModel,
          noiseReductionEnabled,
          model,
        }),
      }),
    },
  };
}

export const REALTIME_TRANSLATION_LANGUAGES = SUPPORTED_LANGUAGES;
