import { describe, expect, it } from "vitest";
import { shouldStopLiveKitRecording } from "./meeting-end";

describe("shouldStopLiveKitRecording", () => {
  it("stops active recordings with a LiveKit egress id", () => {
    expect(shouldStopLiveKitRecording({ status: "active", livekit_egress_id: "egress-1", stopped_at: null })).toBe(true);
    expect(shouldStopLiveKitRecording({ status: "active", livekit_egress_id: null, stopped_at: null })).toBe(false);
    expect(shouldStopLiveKitRecording(null)).toBe(false);
  });

  it("also stops starting recordings that are still processing without a prior stop request", () => {
    expect(shouldStopLiveKitRecording({ status: "processing", livekit_egress_id: "egress-1", stopped_at: null })).toBe(true);
    expect(shouldStopLiveKitRecording({ status: "processing", livekit_egress_id: "egress-1", stopped_at: "2026-05-09T10:00:00.000Z" })).toBe(false);
    expect(shouldStopLiveKitRecording({ status: "processing", livekit_egress_id: null, stopped_at: null })).toBe(false);
  });
});
