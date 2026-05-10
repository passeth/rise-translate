import { describe, expect, it } from "vitest";
import { getTranslationPlaybackPolicy, shouldSubscribeToTranslationTrack } from "./audio-policy";

describe("translation playback policy", () => {
  it("uses original audio only for same-language listeners", () => {
    expect(getTranslationPlaybackPolicy({ sourceLanguage: "ko", listeningLanguage: "ko" })).toEqual({
      mode: "original-only",
      originalVolume: 1,
      translationTrackName: null,
      canMuteOriginal: false,
    });
    expect(shouldSubscribeToTranslationTrack({ sourceLanguage: "ko", listeningLanguage: "ko" })).toBe(false);
  });

  it("uses translated track as primary and keeps original low for different-language listeners", () => {
    expect(getTranslationPlaybackPolicy({ sourceLanguage: "ja", listeningLanguage: "ko" })).toEqual({
      mode: "translation-primary",
      originalVolume: 0.18,
      translationTrackName: "translation-ko",
      canMuteOriginal: true,
    });
    expect(shouldSubscribeToTranslationTrack({ sourceLanguage: "ja", listeningLanguage: "ko" })).toBe(true);
  });

  it("can mute original audio for different-language listeners", () => {
    expect(
      getTranslationPlaybackPolicy({ sourceLanguage: "ru", listeningLanguage: "en", originalMuted: true })
        .originalVolume,
    ).toBe(0);
  });
});
