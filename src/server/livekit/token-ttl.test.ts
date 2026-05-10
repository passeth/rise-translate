import { describe, expect, it } from "vitest";
import { getLiveKitTokenTtl } from "./token-ttl";

describe("getLiveKitTokenTtl", () => {
  it("defaults to a long internal-meeting token TTL", () => {
    expect(getLiveKitTokenTtl(undefined)).toBe("12h");
  });

  it("accepts LiveKit duration strings", () => {
    expect(getLiveKitTokenTtl("30m")).toBe("30m");
    expect(getLiveKitTokenTtl("1d")).toBe("1d");
  });

  it("falls back when the configured TTL is invalid", () => {
    expect(getLiveKitTokenTtl("forever")).toBe("12h");
    expect(getLiveKitTokenTtl("0.5h")).toBe("12h");
  });
});
