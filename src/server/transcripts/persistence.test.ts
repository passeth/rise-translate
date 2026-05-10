import { describe, expect, it } from "vitest";
import { resolveStoredKoreanText, stripNonPersistentTranslations } from "./persistence";

describe("transcript persistence policy", () => {
  it("copies Korean source text into the Korean field", () => {
    expect(resolveStoredKoreanText({ sourceLanguage: "ko", sourceText: "안녕하세요" })).toBe("안녕하세요");
  });

  it("requires Korean translation for non-Korean source text", () => {
    expect(
      resolveStoredKoreanText({ sourceLanguage: "ja", sourceText: "こんにちは", koreanText: "안녕하세요" }),
    ).toBe("안녕하세요");
    expect(() => resolveStoredKoreanText({ sourceLanguage: "ja", sourceText: "こんにちは" })).toThrow(
      "Korean translation is required",
    );
  });

  it("keeps only source and Korean text for permanent storage", () => {
    expect(
      stripNonPersistentTranslations({
        sourceText: "hello",
        koreanText: "안녕하세요",
        englishText: "hello",
      }),
    ).toEqual({ sourceText: "hello", koreanText: "안녕하세요" });
  });
});
