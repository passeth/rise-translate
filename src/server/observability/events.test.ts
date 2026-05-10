import { describe, expect, it } from "vitest";
import { buildOperationalLogRecord, sanitizeOperationalMetadata, toOperationalErrorType } from "./events";

describe("operational events", () => {
  it("builds safe structured logs with required operational fields", () => {
    const record = buildOperationalLogRecord({
      meetingId: "meeting-1",
      roomName: "lk_room",
      featureArea: "translation",
      eventType: "translation_start_failed",
      severity: "error",
      errorType: "OpenAIConnectionError",
      message: "Realtime connection failed.",
      occurredAt: "2026-05-09T00:00:00.000Z",
      metadata: { targetLanguage: "ru", apiKey: "sk-secret", nested: { password: "123456" } },
    });

    expect(record).toMatchObject({
      timestamp: "2026-05-09T00:00:00.000Z",
      meetingId: "meeting-1",
      roomName: "lk_room",
      featureArea: "translation",
      errorType: "OpenAIConnectionError",
    });
    expect(record.metadata).toEqual({
      targetLanguage: "ru",
      apiKey: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });

  it("redacts secret-like metadata keys and truncates long values", () => {
    const metadata = sanitizeOperationalMetadata({
      authorization: "Bearer token",
      serviceRoleKey: "role-key",
      safe: "x".repeat(510),
    }) as Record<string, unknown>;

    expect(metadata.authorization).toBe("[REDACTED]");
    expect(metadata.serviceRoleKey).toBe("[REDACTED]");
    expect(String(metadata.safe)).toHaveLength(501);
  });

  it("normalizes unknown error types", () => {
    expect(toOperationalErrorType(new TypeError("bad"))).toBe("TypeError");
    expect(toOperationalErrorType(new Error("bad"))).toBe("application_error");
    expect(toOperationalErrorType("bad")).toBe("string_error");
    expect(toOperationalErrorType(null)).toBe("unknown_error");
  });
});
