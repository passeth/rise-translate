import { describe, expect, it } from "vitest";
import { buildTranslationWorkerClaimFilter, getTranslationWorkerClaimStaleBefore } from "./worker-claim";

describe("translation worker claim helpers", () => {
  it("calculates the stale claim cutoff from timeout", () => {
    expect(
      getTranslationWorkerClaimStaleBefore({
        now: new Date("2026-05-09T10:00:00.000Z").getTime(),
        timeoutMs: 60_000,
      }),
    ).toBe("2026-05-09T09:59:00.000Z");
  });

  it("builds a Supabase OR filter that includes server pending and stale claimed sessions", () => {
    expect(buildTranslationWorkerClaimFilter("2026-05-09T09:59:00.000Z")).toBe(
      [
        "worker_id.eq.server-pending",
        "and(worker_id.neq.browser-fallback,worker_heartbeat_at.lt.2026-05-09T09:59:00.000Z)",
        "and(worker_id.is.null,worker_heartbeat_at.is.null)",
      ].join(","),
    );
  });

  it("keeps server-pending sessions claimable without matching browser-owned rows", () => {
    const filter = buildTranslationWorkerClaimFilter("2026-05-09T09:59:00.000Z");

    expect(filter).toContain("worker_id.eq.server-pending");
    expect(filter).toContain("worker_id.neq.browser-fallback");
    expect(filter).not.toContain("worker_id.eq.browser-fallback");
  });

  it("keeps legacy null-owned server rows claimable only before heartbeat", () => {
    const filter = buildTranslationWorkerClaimFilter("2026-05-09T09:59:00.000Z");

    expect(filter).toContain("and(worker_id.is.null,worker_heartbeat_at.is.null)");
  });
});
