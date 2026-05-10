import { describe, expect, it, vi } from "vitest";
import {
  decryptMeetingPassword,
  encryptMeetingPassword,
  generateMeetingPassword,
  hashMeetingPassword,
} from "./meeting-password";

describe("meeting password helpers", () => {
  it("generates six digit passwords", () => {
    expect(generateMeetingPassword()).toMatch(/^\d{6}$/);
  });

  it("encrypts and decrypts the display password", () => {
    vi.stubEnv("APP_ENCRYPTION_KEY_BASE64", Buffer.alloc(32, 1).toString("base64"));

    const encrypted = encryptMeetingPassword("482913");

    expect(encrypted).not.toBe("482913");
    expect(decryptMeetingPassword(encrypted)).toBe("482913");

    vi.unstubAllEnvs();
  });

  it("hashes password with meeting-specific context", () => {
    vi.stubEnv("APP_ENCRYPTION_KEY_BASE64", Buffer.alloc(32, 2).toString("base64"));

    expect(hashMeetingPassword("meeting-a", "482913")).not.toBe(
      hashMeetingPassword("meeting-b", "482913"),
    );

    vi.unstubAllEnvs();
  });
});
