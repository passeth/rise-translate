import type { SupportedLanguageCode } from "@/lib/languages";
import { getTranslationTrackName } from "./config";

export type TranslationAudioMode = "original-only" | "translation-primary";

export type TranslationPlaybackPolicy = {
  mode: TranslationAudioMode;
  originalVolume: number;
  translationTrackName: string | null;
  canMuteOriginal: boolean;
};

export function getTranslationPlaybackPolicy({
  sourceLanguage,
  listeningLanguage,
  originalMuted = false,
}: {
  sourceLanguage: SupportedLanguageCode;
  listeningLanguage: SupportedLanguageCode;
  originalMuted?: boolean;
}): TranslationPlaybackPolicy {
  if (sourceLanguage === listeningLanguage) {
    return {
      mode: "original-only",
      originalVolume: 1,
      translationTrackName: null,
      canMuteOriginal: false,
    };
  }

  return {
    mode: "translation-primary",
    originalVolume: originalMuted ? 0 : 0.18,
    translationTrackName: getTranslationTrackName(listeningLanguage),
    canMuteOriginal: true,
  };
}

export function shouldSubscribeToTranslationTrack({
  sourceLanguage,
  listeningLanguage,
}: {
  sourceLanguage: SupportedLanguageCode;
  listeningLanguage: SupportedLanguageCode;
}) {
  return sourceLanguage !== listeningLanguage;
}
