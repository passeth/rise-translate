import { describe, expect, it } from "vitest";
import { getTranslationReconnectDelayMs, shouldRetryTranslationConnection } from "./translation-retry";

describe("translation reconnect policy", () => {
  it("allows bounded retry attempts", () => {
    expect(shouldRetryTranslationConnection({ attempt: 0, maxAttempts: 3 })).toBe(true);
    expect(shouldRetryTranslationConnection({ attempt: 2, maxAttempts: 3 })).toBe(true);
    expect(shouldRetryTranslationConnection({ attempt: 3, maxAttempts: 3 })).toBe(false);
  });

  it("uses capped exponential backoff", () => {
    expect(getTranslationReconnectDelayMs({ attempt: 1, baseDelayMs: 100, maxDelayMs: 500 })).toBe(100);
    expect(getTranslationReconnectDelayMs({ attempt: 2, baseDelayMs: 100, maxDelayMs: 500 })).toBe(200);
    expect(getTranslationReconnectDelayMs({ attempt: 5, baseDelayMs: 100, maxDelayMs: 500 })).toBe(500);
  });
});
