import { describe, expect, it } from "vitest";
import { CAPTION_FONT_SIZE_CLASS, createCaptionEvent } from "./caption-events";

describe("caption events", () => {
  it("creates stable caption event ids when one is not supplied", () => {
    expect(
      createCaptionEvent({
        speakerName: "Tanaka",
        speakerCompany: "ABC",
        sourceLanguage: "ja",
        targetLanguage: "ko",
        sourceText: "こんにちは",
        translatedText: "안녕하세요",
        startedAt: "2026-05-09T00:00:00.000Z",
        isFinal: true,
      }).id,
    ).toBe("2026-05-09T00:00:00.000Z-Tanaka-ko");
  });

  it("exposes all required font-size controls", () => {
    expect(Object.keys(CAPTION_FONT_SIZE_CLASS)).toEqual(["small", "normal", "large", "extra-large"]);
  });
});
