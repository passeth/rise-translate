import { describe, expect, it } from "vitest";
import { generatePublicRoomToken, toLiveKitRoomName } from "./tokens";

describe("meeting tokens", () => {
  it("generates long url-safe non-sequential public tokens", () => {
    const token = generatePublicRoomToken();

    expect(token).toMatch(/^m_[A-Za-z0-9_-]{24}$/);
    expect(token.length).toBeGreaterThanOrEqual(26);
  });

  it("derives a traceable LiveKit room name without reusing the public token directly", () => {
    const token = "m_abc123456789012345678901";

    expect(toLiveKitRoomName(token)).toBe(`lk_${token}`);
    expect(toLiveKitRoomName(token)).not.toBe(token);
  });
});
