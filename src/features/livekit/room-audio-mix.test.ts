import { describe, expect, it } from "vitest";
import { hasActiveBrowserTranslationMix, resolveRoomAudioVolume } from "./room-audio-mix";

describe("room audio mix policy", () => {
  it("keeps original audio at full volume until an actual translation mix is active", () => {
    expect(
      resolveRoomAudioVolume({
        serverTranslationTrackActive: false,
        browserTranslationMixActive: false,
        translatedAudioVolume: 0.9,
        sourceAudioVolume: 0.2,
      }),
    ).toBe(1);
  });

  it("uses source volume while browser translation is connecting or connected", () => {
    expect(
      resolveRoomAudioVolume({
        serverTranslationTrackActive: false,
        browserTranslationMixActive: true,
        translatedAudioVolume: 0.9,
        sourceAudioVolume: 0.2,
      }),
    ).toBe(0.2);
  });

  it("uses interpreter volume when server translation audio is active", () => {
    expect(
      resolveRoomAudioVolume({
        serverTranslationTrackActive: true,
        browserTranslationMixActive: true,
        translatedAudioVolume: 0.9,
        sourceAudioVolume: 0.2,
      }),
    ).toBe(0.9);
  });

  it("detects only different-language active browser translation snapshots", () => {
    expect(
      hasActiveBrowserTranslationMix([
        { enabled: true, sourceLanguage: "ko", targetLanguage: "ko", status: "connected" },
        { enabled: false, sourceLanguage: "ja", targetLanguage: "ko", status: "connected" },
        { enabled: true, sourceLanguage: "ja", targetLanguage: "ko", status: "idle" },
      ]),
    ).toBe(false);

    expect(
      hasActiveBrowserTranslationMix([
        { enabled: true, sourceLanguage: "ja", targetLanguage: "ko", status: "reconnecting" },
      ]),
    ).toBe(true);
  });
});
