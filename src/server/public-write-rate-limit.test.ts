import { describe, expect, it } from "vitest";
import { getPublicWriteRateLimitCutoff, isPublicWriteRateLimited } from "./public-write-rate-limit";

describe("public write rate limit helpers", () => {
  it("computes cutoff timestamp from window", () => {
    expect(
      getPublicWriteRateLimitCutoff({ now: new Date("2026-05-09T10:00:00.000Z").getTime(), windowMs: 60_000 }),
    ).toBe("2026-05-09T09:59:00.000Z");
  });

  it("flags counts at or over the configured maximum", () => {
    expect(isPublicWriteRateLimited({ count: 19, maxWrites: 20 })).toBe(false);
    expect(isPublicWriteRateLimited({ count: 20, maxWrites: 20 })).toBe(true);
    expect(isPublicWriteRateLimited({ count: null, maxWrites: 20 })).toBe(false);
  });
});
