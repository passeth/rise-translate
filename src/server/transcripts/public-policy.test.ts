import { describe, expect, it } from "vitest";
import { validatePublicTranscriptWrite } from "./public-policy";

const source = { id: "source-1", speaking_language: "ru", status: "active" };
const listener = { id: "listener-1", listening_language: "ko", status: "active" };

describe("validatePublicTranscriptWrite", () => {
  it("accepts active source/listener participants with matching languages", () => {
    expect(validatePublicTranscriptWrite({ source, listener, sourceLanguage: "ru", targetLanguage: "ko" })).toEqual({
      ok: true,
      sourceParticipantId: "source-1",
      listenerParticipantId: "listener-1",
    });
  });

  it("rejects unknown or inactive source participants", () => {
    expect(validatePublicTranscriptWrite({ source: null, listener, sourceLanguage: "ru", targetLanguage: "ko" })).toMatchObject({
      ok: false,
      reason: "source_participant_not_found",
    });
    expect(
      validatePublicTranscriptWrite({ source: { ...source, status: "left" }, listener, sourceLanguage: "ru", targetLanguage: "ko" }),
    ).toMatchObject({ ok: false, reason: "source_participant_not_active" });
  });

  it("rejects source or listener language mismatches", () => {
    expect(validatePublicTranscriptWrite({ source, listener, sourceLanguage: "ja", targetLanguage: "ko" })).toMatchObject({
      ok: false,
      reason: "source_language_mismatch",
    });
    expect(validatePublicTranscriptWrite({ source, listener, sourceLanguage: "ru", targetLanguage: "en" })).toMatchObject({
      ok: false,
      reason: "listener_language_mismatch",
    });
  });
});
