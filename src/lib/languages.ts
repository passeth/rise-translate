export const SUPPORTED_LANGUAGES = [
  { code: "ko", label: "Korean" },
  { code: "en", label: "English" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ru", label: "Russian" },
  { code: "vi", label: "Vietnamese" },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function isSupportedLanguage(value: string): value is SupportedLanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value);
}
