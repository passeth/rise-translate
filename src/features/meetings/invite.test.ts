import { describe, expect, it } from "vitest";
import { buildInvitationText, buildMeetingUrl, isLocalInvitationUrl } from "./invite";

describe("meeting invite helpers", () => {
  it("builds stable meeting URLs without duplicate slashes", () => {
    expect(buildMeetingUrl("https://meet.example.com/", "token-1")).toBe("https://meet.example.com/meeting/token-1");
  });

  it("detects local invitation URLs", () => {
    expect(isLocalInvitationUrl("http://localhost:3000")).toBe(true);
    expect(isLocalInvitationUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalInvitationUrl("https://meet.example.com")).toBe(false);
    expect(isLocalInvitationUrl("not a url")).toBe(true);
  });

  it("keeps invitation text in English with link, password, and instructions", () => {
    const text = buildInvitationText({
      title: "Buyer call",
      publicToken: "token-1",
      password: "123456",
      scheduledStartAt: "2026-05-09T10:00:00.000Z",
    });

    expect(text).toContain("Meeting: Buyer call");
    expect(text).toContain("Meeting password: 123456");
    expect(text).toContain("How to join:");
  });
});
