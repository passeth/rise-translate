import { describe, expect, it } from "vitest";
import { buildRecordingStorageRemovalPlan } from "./expiry";

describe("buildRecordingStorageRemovalPlan", () => {
  it("groups removable recording files by bucket", () => {
    expect(
      buildRecordingStorageRemovalPlan([
        { id: "r1", bucket: "recordings", object_key: "a.mp4" },
        { id: "r2", bucket: "recordings", object_key: "b.mp4" },
        { id: "r3", bucket: "archive", object_key: "c.mp4" },
      ]),
    ).toEqual([
      { bucket: "recordings", objectKeys: ["a.mp4", "b.mp4"], recordingIds: ["r1", "r2"] },
      { bucket: "archive", objectKeys: ["c.mp4"], recordingIds: ["r3"] },
    ]);
  });

  it("skips rows without a concrete storage object", () => {
    expect(
      buildRecordingStorageRemovalPlan([
        { id: "r1", bucket: null, object_key: "a.mp4" },
        { id: "r2", bucket: "recordings", object_key: null },
      ]),
    ).toEqual([]);
  });
});
