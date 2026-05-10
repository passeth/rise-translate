import { getServerEnv } from "@/lib/env";
import { buildTranslationSessionConfig } from "@/lib/realtime-translation-config";
import type { SupportedLanguageCode } from "@/lib/languages";

export type RealtimeTranslationSessionConfig = {
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
};

export function buildRealtimeTranslationSessionConfig({
  sourceLanguage,
  targetLanguage,
}: RealtimeTranslationSessionConfig) {
  const env = getServerEnv();

  return buildTranslationSessionConfig({
    model: env.OPENAI_TRANSLATION_MODEL,
    language: targetLanguage,
    sourceLanguage,
    inputTranscriptionEnabled: true,
    inputTranscriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
    noiseReductionEnabled: true,
  });
}

export function getRealtimeWebSocketUrl() {
  const env = getServerEnv();
  return `wss://api.openai.com/v1/realtime/translations?model=${encodeURIComponent(env.OPENAI_TRANSLATION_MODEL)}`;
}
