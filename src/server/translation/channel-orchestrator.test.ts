import { describe, expect, it, vi } from "vitest";
import {
  getExpectedTranslationTargetLanguages,
  getNeededTranslationTargetLanguagesForListeners,
  getTranslationTargetLanguages,
} from "./channel-orchestrator";

describe("six-channel translation orchestration", () => {
  it("returns every target language except the speaker source language", () => {
    expect(getExpectedTranslationTargetLanguages("ko")).toEqual(["en", "zh", "ja", "ru", "vi"]);
    expect(getExpectedTranslationTargetLanguages("vi")).toEqual(["ko", "en", "zh", "ja", "ru"]);
  });

  it("deduplicates requested target languages and skips the source language", () => {
    expect(getTranslationTargetLanguages("ko", ["ko", "en", "en", "ru"])).toEqual(["en", "ru"]);
    expect(getTranslationTargetLanguages("ja")).toEqual(["ko", "en", "zh", "ru", "vi"]);
    expect(getTranslationTargetLanguages("ja", [])).toEqual([]);
  });

  it("derives needed target languages from listeners without self-translation", () => {
    expect(
      getNeededTranslationTargetLanguagesForListeners({
        sourceParticipantId: "speaker-1",
        sourceLanguage: "ja",
        listeners: [
          { participantId: "speaker-1", listeningLanguage: "ru" },
          { participantId: "listener-1", listeningLanguage: "ko" },
          { participantId: "listener-2", listeningLanguage: "ko" },
          { participantId: "listener-3", listeningLanguage: "ja" },
          { participantId: "listener-4", listeningLanguage: null },
        ],
      }),
    ).toEqual(["ko"]);
  });

  it("would start one lane per non-matching target", async () => {
    const router = await import("./router");
    const spy = vi.spyOn(router, "startTranslationRouterForParticipant").mockResolvedValue({
      sessionId: "session",
      targetLanguage: "ko",
      targetTrackName: "translation-ko",
      realtimeConfig: {
        model: "gpt-realtime-test",
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper" },
            noise_reduction: { type: "far_field" },
          },
          output: { language: "ko" },
        },
      },
    });
    const { startAllTranslationTargetsForParticipant } = await import("./channel-orchestrator");

    const result = await startAllTranslationTargetsForParticipant({
      meetingId: "meeting-1",
      livekitRoomName: "lk_room",
      sourceParticipantId: "participant-1",
      sourceIdentity: "guest_1",
      sourceLanguage: "ja",
    });

    expect(result.sessionCount).toBe(5);
    expect(spy).toHaveBeenCalledTimes(5);
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: "ja" }));

    spy.mockRestore();
  });

  it("starts only requested listener target languages when provided", async () => {
    const router = await import("./router");
    const spy = vi.spyOn(router, "startTranslationRouterForParticipant").mockResolvedValue({
      sessionId: "session",
      targetLanguage: "ko",
      targetTrackName: "translation-ko",
      realtimeConfig: {
        model: "gpt-realtime-test",
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper" },
            noise_reduction: { type: "far_field" },
          },
          output: { language: "ko" },
        },
      },
    });
    const { startAllTranslationTargetsForParticipant } = await import("./channel-orchestrator");

    const result = await startAllTranslationTargetsForParticipant({
      meetingId: "meeting-1",
      livekitRoomName: "lk_room",
      sourceParticipantId: "participant-1",
      sourceIdentity: "guest_1",
      sourceLanguage: "ja",
      targetLanguages: ["ko", "ja", "ko", "ru"],
    });

    expect(result.sessionCount).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: "ko" }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: "ru" }));
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: "ja" }));

    spy.mockRestore();
  });

  it("does not fall back to all languages when requested listener target languages are empty", async () => {
    const router = await import("./router");
    const spy = vi.spyOn(router, "startTranslationRouterForParticipant").mockResolvedValue({
      sessionId: "session",
      targetLanguage: "ko",
      targetTrackName: "translation-ko",
      realtimeConfig: {
        model: "gpt-realtime-test",
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper" },
            noise_reduction: { type: "far_field" },
          },
          output: { language: "ko" },
        },
      },
    });
    const { startAllTranslationTargetsForParticipant } = await import("./channel-orchestrator");

    const result = await startAllTranslationTargetsForParticipant({
      meetingId: "meeting-1",
      livekitRoomName: "lk_room",
      sourceParticipantId: "participant-1",
      sourceIdentity: "guest_1",
      sourceLanguage: "ja",
      targetLanguages: [],
    });

    expect(result.sessionCount).toBe(0);
    expect(result.sessions).toEqual([]);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
