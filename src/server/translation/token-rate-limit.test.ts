import { describe, expect, it } from "vitest";
import {
  assertTranslationTokenRateLimit,
  getTranslationTokenWindowStart,
  TranslationTokenRateLimitError,
} from "./token-rate-limit";

describe("translation token rate limit", () => {
  it("computes the sliding window start", () => {
    expect(
      getTranslationTokenWindowStart({
        now: new Date("2026-05-09T10:00:00.000Z").getTime(),
        windowMs: 60_000,
      }),
    ).toBe("2026-05-09T09:59:00.000Z");
  });

  it("allows below-limit requests and rejects at the limit", () => {
    expect(() => assertTranslationTokenRateLimit({ issuedCount: 11, limit: 12 })).not.toThrow();
    expect(() => assertTranslationTokenRateLimit({ issuedCount: 12, limit: 12 })).toThrow(
      TranslationTokenRateLimitError,
    );
  });
});
