import { describe, expect, it, vi } from "vitest";
import { TranslationWorkerNotReadyError } from "./readiness";
import { BROWSER_TRANSLATION_WORKER_ID, PENDING_SERVER_TRANSLATION_WORKER_ID } from "./session-ownership";
import {
  getBrowserFallbackSessionIds,
  isBrowserFallbackTranslationSession,
  isTranslationLaneUniqueConflict,
  selectReusableServerSession,
  startTranslationRouterForParticipant,
  type ExistingTranslationSessionRow,
} from "./router";

describe("translation router validation", () => {
  it("rejects same-language translation lanes before touching external state", async () => {
    await expect(
      startTranslationRouterForParticipant({
        meetingId: "meeting-1",
        livekitRoomName: "lk_room",
        sourceParticipantId: "participant-1",
        sourceIdentity: "guest_1",
        sourceLanguage: "ko",
        targetLanguage: "ko",
      }),
    ).rejects.toThrow("must be different");
  });

  it("rejects server starts when no production media worker is configured", async () => {
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");

    await expect(
      startTranslationRouterForParticipant({
        meetingId: "meeting-1",
        livekitRoomName: "lk_room",
        sourceParticipantId: "participant-1",
        sourceIdentity: "guest_1",
        sourceLanguage: "ko",
        targetLanguage: "ru",
      }),
    ).rejects.toThrow(TranslationWorkerNotReadyError);

    vi.unstubAllEnvs();
  });

  it("rejects dry-run workers for server translation starts", async () => {
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "true");

    await expect(
      startTranslationRouterForParticipant({
        meetingId: "meeting-1",
        livekitRoomName: "lk_room",
        sourceParticipantId: "participant-1",
        sourceIdentity: "guest_1",
        sourceLanguage: "ko",
        targetLanguage: "ru",
      }),
    ).rejects.toThrow(TranslationWorkerNotReadyError);

    vi.unstubAllEnvs();
  });

  it("detects active-lane unique constraint conflicts for concurrent starts", () => {
    expect(
      isTranslationLaneUniqueConflict({
        code: "23505",
        message: "duplicate key value violates unique constraint \"rt_translation_sessions_one_active_lane_idx\"",
      }),
    ).toBe(true);
    expect(isTranslationLaneUniqueConflict({ code: "23505", message: "other constraint" })).toBe(false);
    expect(isTranslationLaneUniqueConflict({ code: "PGRST116", message: "not found" })).toBe(false);
  });

  it("uses a stable sentinel worker id for server-created pending sessions", () => {
    expect(PENDING_SERVER_TRANSLATION_WORKER_ID).toBe("server-pending");
    expect(BROWSER_TRANSLATION_WORKER_ID).toBe("browser-fallback");
  });

  it("does not reuse browser fallback lanes as server translation sessions", () => {
    const browserFallbackSession = buildExistingSession({
      id: "browser-1",
      worker_id: BROWSER_TRANSLATION_WORKER_ID,
      updated_at: "2026-05-09T09:00:00.000Z",
    });
    const serverPendingSession = buildExistingSession({
      id: "server-1",
      worker_id: PENDING_SERVER_TRANSLATION_WORKER_ID,
      updated_at: "2026-05-09T08:59:00.000Z",
    });

    expect(selectReusableServerSession([browserFallbackSession])).toBeNull();
    expect(selectReusableServerSession([browserFallbackSession, serverPendingSession])).toBe(serverPendingSession);
    expect(getBrowserFallbackSessionIds([browserFallbackSession, serverPendingSession])).toEqual(["browser-1"]);
  });

  it("treats real and legacy worker ownership as reusable server lanes", () => {
    const realWorkerSession = buildExistingSession({ id: "worker-1", worker_id: "translation-worker-a" });
    const legacySession = buildExistingSession({ id: "legacy-1", worker_id: null });

    expect(isBrowserFallbackTranslationSession(realWorkerSession)).toBe(false);
    expect(isBrowserFallbackTranslationSession(legacySession)).toBe(false);
    expect(selectReusableServerSession([realWorkerSession])).toBe(realWorkerSession);
    expect(selectReusableServerSession([legacySession])).toBe(legacySession);
  });

});

function buildExistingSession(
  overrides: Partial<ExistingTranslationSessionRow> = {},
): ExistingTranslationSessionRow {
  return {
    id: "session-1",
    target_track_name: "translation-ru",
    status: "connected",
    updated_at: "2026-05-09T09:00:00.000Z",
    worker_id: PENDING_SERVER_TRANSLATION_WORKER_ID,
    ...overrides,
  };
}
