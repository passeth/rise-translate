import { describe, expect, it } from "vitest";
import { BLOCKING_RECORDING_STATUSES, isBlockingRecordingStatus, isRecordingBlockingUniqueConflict } from "./active-status";

describe("recording active status helpers", () => {
  it("defines the statuses that block a new recording", () => {
    expect(BLOCKING_RECORDING_STATUSES).toEqual(["active", "processing"]);
  });

  it("only blocks active or processing recordings", () => {
    expect(isBlockingRecordingStatus("active")).toBe(true);
    expect(isBlockingRecordingStatus("processing")).toBe(true);
    expect(isBlockingRecordingStatus("available")).toBe(false);
    expect(isBlockingRecordingStatus("failed")).toBe(false);
    expect(isBlockingRecordingStatus(null)).toBe(false);
  });
  it("detects duplicate blocking recording conflicts", () => {
    expect(
      isRecordingBlockingUniqueConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "rt_recordings_one_blocking_per_meeting_idx"',
      }),
    ).toBe(true);
    expect(isRecordingBlockingUniqueConflict({ code: "23505", message: "other" })).toBe(false);
    expect(isRecordingBlockingUniqueConflict(null)).toBe(false);
  });

});
