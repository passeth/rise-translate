import { describe, expect, it, vi } from "vitest";
import { runTranslationWorkerLoop } from "./worker-loop";

describe("runTranslationWorkerLoop", () => {
  it("keeps polling with idle backoff and summarizes work", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const worker = {
      runOnce: vi
        .fn()
        .mockResolvedValueOnce({ processed: false, reason: "no-session" })
        .mockResolvedValueOnce({ processed: true, sessionId: "s1", status: "connected" })
        .mockResolvedValueOnce({ processed: false, reason: "no-session" }),
    };

    await expect(runTranslationWorkerLoop({ worker, maxIterations: 3, sleep })).resolves.toEqual({
      iterations: 3,
      processedSessions: 1,
      idleIterations: 2,
      errors: 0,
    });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it("records worker errors and applies error backoff", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const worker = {
      runOnce: vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce({ processed: false, reason: "no-session" }),
    };

    await expect(runTranslationWorkerLoop({ worker, maxIterations: 2, sleep, onError })).resolves.toEqual({
      iterations: 2,
      processedSessions: 0,
      idleIterations: 1,
      errors: 1,
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(sleep).toHaveBeenCalledWith(5_000);
  });
});
