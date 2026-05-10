import { describe, expect, it } from "vitest";
import { validateTranslationTokenRequest, TranslationTokenPolicyError } from "./token-policy";

const activeSourceParticipant = {
  livekit_identity: "guest_1",
  speaking_language: "ko",
  status: "active",
};

const activeListenerParticipant = {
  livekit_identity: "host_1",
  listening_language: "ru",
  status: "active",
};

describe("translation token policy", () => {
  it("allows active source/listener participants with matching preferences", () => {
    expect(
      validateTranslationTokenRequest({
        sourceParticipant: activeSourceParticipant,
        listenerParticipant: activeListenerParticipant,
        requestedSourceLanguage: "ko",
        targetLanguage: "ru",
      }),
    ).toEqual({ sourceLanguage: "ko", targetLanguage: "ru" });
  });

  it("rejects inactive or missing participants", () => {
    expect(() =>
      validateTranslationTokenRequest({
        sourceParticipant: null,
        listenerParticipant: activeListenerParticipant,
        targetLanguage: "ru",
      }),
    ).toThrow(TranslationTokenPolicyError);
    expect(() =>
      validateTranslationTokenRequest({
        sourceParticipant: activeSourceParticipant,
        listenerParticipant: { ...activeListenerParticipant, status: "left" },
        targetLanguage: "ru",
      }),
    ).toThrow("not active");
  });

  it("rejects language mismatch and same-language translation", () => {
    expect(() =>
      validateTranslationTokenRequest({
        sourceParticipant: activeSourceParticipant,
        listenerParticipant: activeListenerParticipant,
        requestedSourceLanguage: "ja",
        targetLanguage: "ru",
      }),
    ).toThrow("does not match");
    expect(() =>
      validateTranslationTokenRequest({
        sourceParticipant: activeSourceParticipant,
        listenerParticipant: activeListenerParticipant,
        requestedSourceLanguage: "ko",
        targetLanguage: "ja",
      }),
    ).toThrow("listener preference");
    expect(() =>
      validateTranslationTokenRequest({
        sourceParticipant: activeSourceParticipant,
        listenerParticipant: { ...activeListenerParticipant, listening_language: "ko" },
        requestedSourceLanguage: "ko",
        targetLanguage: "ko",
      }),
    ).toThrow("not required");
  });

  it("rejects translating a participant's own microphone", () => {
    expect(() =>
      validateTranslationTokenRequest({
        sourceParticipant: activeSourceParticipant,
        listenerParticipant: { livekit_identity: "guest_1", listening_language: "ru", status: "active" },
        requestedSourceLanguage: "ko",
        targetLanguage: "ru",
      }),
    ).toThrow("own microphone");
  });
});
