import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "@/lib/languages";

export const TRANSLATION_TRACK_PREFIX = "translation";

export function getTranslationTrackName(language: SupportedLanguageCode) {
  return `${TRANSLATION_TRACK_PREFIX}-${language}`;
}

export function getTargetLanguages(sourceLanguage: SupportedLanguageCode) {
  return SUPPORTED_LANGUAGES.map((language) => language.code).filter(
    (language) => language !== sourceLanguage,
  );
}

export function buildTranslationInstructions({
  sourceLanguage,
  targetLanguage,
}: {
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
}) {
  return [
    "You are a realtime business meeting interpreter for EVAS buyer meetings.",
    `Translate the speaker from ${sourceLanguage} to ${targetLanguage} only.`,
    "Preserve product names, model numbers, quantities, prices, and company names as spoken.",
    "Do not answer as an assistant. Only produce the translated speech and transcript.",
    "If the input is unclear or overlapping, keep the translation concise and faithful.",
  ].join(" ");
}
