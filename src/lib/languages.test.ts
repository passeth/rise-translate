import { describe, expect, it } from "vitest";
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from "./languages";

describe("supported languages", () => {
  it("matches the v1 PRD language set", () => {
    expect(SUPPORTED_LANGUAGES.map((language) => language.code)).toEqual([
      "ko",
      "en",
      "zh",
      "ja",
      "ru",
      "vi",
    ]);
  });

  it("validates language codes", () => {
    expect(isSupportedLanguage("ko")).toBe(true);
    expect(isSupportedLanguage("es")).toBe(false);
  });
});
