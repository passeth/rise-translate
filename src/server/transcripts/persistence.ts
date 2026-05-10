import type { SupportedLanguageCode } from "@/lib/languages";

export type TranscriptPersistenceInput = {
  sourceLanguage: SupportedLanguageCode;
  sourceText: string;
  koreanText?: string;
};

export function resolveStoredKoreanText({
  sourceLanguage,
  sourceText,
  koreanText,
}: TranscriptPersistenceInput) {
  if (sourceLanguage === "ko") {
    return sourceText;
  }

  const normalized = koreanText?.trim();

  if (!normalized) {
    throw new Error("Korean translation is required for non-Korean transcript segments.");
  }

  return normalized;
}

export function stripNonPersistentTranslations<T extends { sourceText: string; koreanText: string }>(segment: T) {
  return {
    sourceText: segment.sourceText,
    koreanText: segment.koreanText,
  };
}
