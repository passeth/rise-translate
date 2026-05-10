import { describe, expect, it } from "vitest";
import { isNonRetryableTranslationTokenStatus, NonRetryableTranslationError } from "./translation-errors";

describe("translation error policy", () => {
  it("marks policy/auth/rate-limit token failures as non-retryable", () => {
    expect(isNonRetryableTranslationTokenStatus(400)).toBe(true);
    expect(isNonRetryableTranslationTokenStatus(401)).toBe(true);
    expect(isNonRetryableTranslationTokenStatus(409)).toBe(true);
    expect(isNonRetryableTranslationTokenStatus(429)).toBe(true);
    expect(isNonRetryableTranslationTokenStatus(500)).toBe(false);
    expect(new NonRetryableTranslationError("x").name).toBe("NonRetryableTranslationError");
  });
});
