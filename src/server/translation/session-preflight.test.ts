import { describe, expect, it } from "vitest";
import { evaluateTranslationSessionPreflight } from "./session-preflight";

describe("evaluateTranslationSessionPreflight", () => {
  it("allows active participants in available meetings", () => {
    expect(
      evaluateTranslationSessionPreflight({
        meeting: { lifecycle_status: "active" },
        participant: { status: "active", speaking_language: "ko" },
        sourceLanguage: "ko",
        sourceIdentity: "guest_1",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects ended or missing meetings", () => {
    expect(
      evaluateTranslationSessionPreflight({
        meeting: { lifecycle_status: "ended" },
        participant: { status: "active", speaking_language: "ko" },
        sourceLanguage: "ko",
        sourceIdentity: "guest_1",
      }),
    ).toMatchObject({ ok: false, reason: "meeting_unavailable" });
  });

  it("rejects missing or inactive source participants", () => {
    expect(
      evaluateTranslationSessionPreflight({
        meeting: { lifecycle_status: "active" },
        participant: { status: "left", speaking_language: "ko" },
        sourceLanguage: "ko",
        sourceIdentity: "guest_1",
      }),
    ).toMatchObject({ ok: false, reason: "participant_unavailable" });
  });

  it("rejects stale sessions after the source participant language changes", () => {
    expect(
      evaluateTranslationSessionPreflight({
        meeting: { lifecycle_status: "active" },
        participant: { status: "active", speaking_language: "ja" },
        sourceLanguage: "ko",
        sourceIdentity: "guest_1",
      }),
    ).toMatchObject({ ok: false, reason: "language_mismatch" });
  });
});
