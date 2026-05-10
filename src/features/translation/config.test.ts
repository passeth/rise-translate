import { describe, expect, it } from "vitest";
import {
  buildTranslationInstructions,
  getTargetLanguages,
  getTranslationTrackName,
} from "./config";

describe("translation config", () => {
  it("builds LiveKit target track names", () => {
    expect(getTranslationTrackName("ko")).toBe("translation-ko");
  });

  it("targets every supported language except the source language", () => {
    expect(getTargetLanguages("ko")).toEqual(["en", "zh", "ja", "ru", "vi"]);
  });

  it("creates interpreter-only realtime instructions", () => {
    expect(buildTranslationInstructions({ sourceLanguage: "ja", targetLanguage: "ko" })).toContain(
      "Only produce the translated speech",
    );
  });
});
