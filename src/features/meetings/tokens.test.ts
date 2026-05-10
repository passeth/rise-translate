import { describe, expect, it } from "vitest";
import { generatePublicRoomToken, toLiveKitRoomName } from "./tokens";

describe("meeting tokens", () => {
  it("generates short human-friendly public invite tokens", () => {
    const token = generatePublicRoomToken();

    expect(token).toMatch(/^m_[A-Z2-9]{6}$/);
    expect(token).not.toMatch(/[IO01]/);
  });

  it("derives a traceable LiveKit room name without reusing the public token directly", () => {
    const token = "m_ABC234";

    expect(toLiveKitRoomName(token)).toBe(`lk_${token}`);
    expect(toLiveKitRoomName(token)).not.toBe(token);
  });
});
