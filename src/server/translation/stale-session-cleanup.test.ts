import { describe, expect, it } from "vitest";
import {
  buildStaleTranslationSessionCleanupOwnershipFilter,
  getStaleTranslationSessionCutoff,
} from "./stale-session-cleanup";

describe("getStaleTranslationSessionCutoff", () => {
  it("computes a cutoff for stale starting/reconnecting translation sessions", () => {
    expect(
      getStaleTranslationSessionCutoff({
        now: new Date("2026-05-09T12:30:00.000Z").getTime(),
        maxAgeMs: 30 * 60 * 1000,
      }),
    ).toBe("2026-05-09T12:00:00.000Z");
  });

  it("excludes browser fallback rows from worker-startup stale cleanup", () => {
    const filter = buildStaleTranslationSessionCleanupOwnershipFilter();

    expect(filter).toBe("worker_id.neq.browser-fallback,worker_id.is.null");
    expect(filter).not.toContain("worker_id.eq.browser-fallback");
  });
});
