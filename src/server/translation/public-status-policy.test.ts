import { describe, expect, it } from "vitest";
import { validatePublicTranslationStatusWrite } from "./public-status-policy";

const source = { id: "source-1", speaking_language: "ru", status: "active" };
const listener = { id: "listener-1", listening_language: "ko", status: "active" };

describe("validatePublicTranslationStatusWrite", () => {
  it("accepts active source/listener participants for the listener target language", () => {
    expect(validatePublicTranslationStatusWrite({ source, listener, targetLanguage: "ko" })).toEqual({
      ok: true,
      sourceParticipantId: "source-1",
      listenerParticipantId: "listener-1",
      sourceLanguage: "ru",
    });
  });

  it("ignores same-language lanes instead of creating fake translation sessions", () => {
    expect(
      validatePublicTranslationStatusWrite({
        source: { ...source, speaking_language: "ko" },
        listener,
        targetLanguage: "ko",
      }),
    ).toEqual({ ok: false, reason: "same_language_translation_not_required", status: 200, ignore: true });
  });

  it("rejects inactive participants or listener language mismatch", () => {
    expect(validatePublicTranslationStatusWrite({ source: { ...source, status: "left" }, listener, targetLanguage: "ko" })).toMatchObject({
      ok: false,
      reason: "source_participant_not_active",
    });
    expect(validatePublicTranslationStatusWrite({ source, listener, targetLanguage: "en" })).toMatchObject({
      ok: false,
      reason: "listener_language_mismatch",
    });
  });
});
