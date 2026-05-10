import { describe, expect, it, vi } from "vitest";
import type { TranslationBridge } from "./bridge";
import type { TranslationSessionRecord, TranslationSessionRepository } from "./session-repository";
import { TranslationWorker } from "./worker";

const session: TranslationSessionRecord = {
  sessionId: "session-1",
  meetingId: "meeting-1",
  livekitRoomName: "lk_room",
  sourceParticipantIdentity: "guest_1",
  sourceLanguage: "ja",
  targetLanguage: "ko",
  targetTrackName: "translation-ko",
  status: "starting",
};

describe("TranslationWorker", () => {
  it("does nothing when no sessions are available", async () => {
    const repository: TranslationSessionRepository = {
      claimNext: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn(),
    };
    const worker = new TranslationWorker({ repository, publishStatus: vi.fn() });

    await expect(worker.runOnce()).resolves.toEqual({ processed: false, reason: "no-session" });
  });

  it("claims a session, starts bridge, persists status, and emits status", async () => {
    const repository: TranslationSessionRepository = {
      claimNext: vi.fn().mockResolvedValue(session),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    const bridge: TranslationBridge = {
      start: vi.fn().mockResolvedValue({ status: "connected", message: "ok" }),
      stop: vi.fn(),
    };
    const publishStatus = vi.fn().mockResolvedValue(undefined);
    const worker = new TranslationWorker({ repository, bridge, publishStatus, validateSession: vi.fn().mockResolvedValue({ ok: true }) });

    await expect(worker.runOnce()).resolves.toEqual({
      processed: true,
      sessionId: "session-1",
      status: "connected",
    });
    expect(repository.updateStatus).toHaveBeenCalledWith("session-1", "connected", {
      error: undefined,
      heartbeat: true,
    });
    expect(publishStatus).toHaveBeenCalledWith(
      "lk_room",
      expect.objectContaining({ status: "connected", targetLanguage: "ko" }),
    );
  });

  it("marks session failed when bridge throws", async () => {
    const repository: TranslationSessionRepository = {
      claimNext: vi.fn().mockResolvedValue(session),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    const bridge: TranslationBridge = {
      start: vi.fn().mockRejectedValue(new Error("media failure")),
      stop: vi.fn(),
    };
    const worker = new TranslationWorker({ repository, bridge, publishStatus: vi.fn(), validateSession: vi.fn().mockResolvedValue({ ok: true }) });

    await expect(worker.runOnce()).resolves.toMatchObject({ status: "failed" });
    expect(repository.updateStatus).toHaveBeenCalledWith("session-1", "failed", {
      error: "media failure",
      heartbeat: true,
    });
  });

  it("fails stale claimed sessions before starting the bridge", async () => {
    const repository: TranslationSessionRepository = {
      claimNext: vi.fn().mockResolvedValue(session),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    const bridge: TranslationBridge = {
      start: vi.fn(),
      stop: vi.fn(),
    };
    const publishStatus = vi.fn().mockResolvedValue(undefined);
    const worker = new TranslationWorker({
      repository,
      bridge,
      publishStatus,
      validateSession: vi.fn().mockResolvedValue({
        ok: false,
        reason: "participant_unavailable",
        message: "source participant left",
      }),
    });

    await expect(worker.runOnce()).resolves.toEqual({
      processed: true,
      sessionId: "session-1",
      status: "failed",
    });
    expect(bridge.start).not.toHaveBeenCalled();
    expect(repository.updateStatus).toHaveBeenCalledWith("session-1", "failed", {
      error: "source participant left",
      heartbeat: true,
    });
    expect(publishStatus).toHaveBeenCalledWith("lk_room", expect.objectContaining({ status: "failed" }));
  });

  it("creates a fresh bridge per claimed session when a factory is provided", async () => {
    const repository: TranslationSessionRepository = {
      claimNext: vi.fn().mockResolvedValue(session),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    const firstBridge: TranslationBridge = {
      start: vi.fn().mockResolvedValue({ status: "connected", message: "first" }),
      stop: vi.fn(),
    };
    const secondBridge: TranslationBridge = {
      start: vi.fn().mockResolvedValue({ status: "connected", message: "second" }),
      stop: vi.fn(),
    };
    const bridgeFactory = vi.fn().mockReturnValueOnce(firstBridge).mockReturnValueOnce(secondBridge);
    const worker = new TranslationWorker({
      repository,
      bridgeFactory,
      publishStatus: vi.fn(),
      validateSession: vi.fn().mockResolvedValue({ ok: true }),
    });

    await worker.runOnce();
    await worker.runOnce();

    expect(bridgeFactory).toHaveBeenCalledTimes(2);
    expect(firstBridge.start).toHaveBeenCalledTimes(1);
    expect(secondBridge.start).toHaveBeenCalledTimes(1);
  });
});
