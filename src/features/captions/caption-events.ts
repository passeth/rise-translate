import type { SupportedLanguageCode } from "@/lib/languages";

export type CaptionFontSize = "small" | "normal" | "large" | "extra-large";

export type CaptionEvent = {
  id: string;
  speakerName: string;
  speakerCompany: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
  sourceText: string;
  translatedText: string;
  startedAt: string;
  isFinal: boolean;
  status?: "connected" | "delayed" | "reconnecting" | "unavailable";
};

export const CAPTION_FONT_SIZE_CLASS: Record<CaptionFontSize, string> = {
  small: "text-sm",
  normal: "text-base",
  large: "text-lg",
  "extra-large": "text-2xl",
};

export function createCaptionEvent(input: Omit<CaptionEvent, "id"> & { id?: string }): CaptionEvent {
  return {
    id: input.id ?? `${input.startedAt}-${input.speakerName}-${input.targetLanguage}`,
    ...input,
  };
}
