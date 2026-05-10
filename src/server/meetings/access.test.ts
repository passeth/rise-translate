import { describe, expect, it } from "vitest";
import { isGuestSessionUsable } from "./access";

describe("isGuestSessionUsable", () => {
  it("allows created, active, and left sessions to continue/rejoin active meetings", () => {
    expect(isGuestSessionUsable("created")).toBe(true);
    expect(isGuestSessionUsable("active")).toBe(true);
    expect(isGuestSessionUsable("left")).toBe(true);
  });

  it("rejects revoked or expired guest sessions", () => {
    expect(isGuestSessionUsable("expired")).toBe(false);
    expect(isGuestSessionUsable("replaced")).toBe(false);
    expect(isGuestSessionUsable("blocked")).toBe(false);
    expect(isGuestSessionUsable(null)).toBe(false);
  });
});
