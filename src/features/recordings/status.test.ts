import { describe, expect, it } from "vitest";
import { calculateRecordingExpiry, mapLiveKitEgressStatus } from "./status";

describe("recording status helpers", () => {
  it("maps LiveKit terminal states to app recording states", () => {
    expect(mapLiveKitEgressStatus(1)).toBe("active");
    expect(mapLiveKitEgressStatus(3)).toBe("available");
    expect(mapLiveKitEgressStatus(4)).toBe("failed");
  });

  it("expires recordings seven days after start by default", () => {
    expect(calculateRecordingExpiry("2026-05-09T00:00:00.000Z")).toBe("2026-05-16T00:00:00.000Z");
  });
});
