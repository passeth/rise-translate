import { describe, expect, it } from "vitest";
import { isActiveScopedParticipant } from "./participant-scope";

describe("isActiveScopedParticipant", () => {
  it("accepts joining and active participants only", () => {
    expect(isActiveScopedParticipant({ id: "p1", status: "joining" })).toBe(true);
    expect(isActiveScopedParticipant({ id: "p1", status: "active" })).toBe(true);
    expect(isActiveScopedParticipant({ id: "p1", status: "left" })).toBe(false);
    expect(isActiveScopedParticipant(null)).toBe(false);
  });
});
