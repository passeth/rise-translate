import { describe, expect, it } from "vitest";
import type { RecordingRow } from "./repository";
import { buildStaleRecordingStartRecoveryPatch, isStaleRecordingStart } from "./stale-start";

function recording(patch: Partial<RecordingRow>): RecordingRow {
  return {
    id: "recording-1",
    meeting_id: "meeting-1",
    livekit_egress_id: null,
    storage_provider: "supabase-s3",
    bucket: "recordings",
    object_key: "recording.mp4",
    status: "active",
    started_at: "2026-05-09T10:00:00.000Z",
    stopped_at: null,
    available_at: null,
    expires_at: null,
    deleted_at: null,
    created_at: "2026-05-09T10:00:00.000Z",
    metadata: {},
    ...patch,
  };
}

describe("isStaleRecordingStart", () => {
  it("detects active recording rows without egress after timeout", () => {
    const now = new Date("2026-05-09T10:03:00.000Z").getTime();
    expect(isStaleRecordingStart(recording({ status: "active", livekit_egress_id: null, started_at: "2026-05-09T10:00:00.000Z" }), { now })).toBe(true);
    expect(isStaleRecordingStart(recording({ status: "active", livekit_egress_id: null, started_at: "2026-05-09T10:02:30.000Z" }), { now })).toBe(false);
  });

  it("does not treat recordings with egress ids or terminal statuses as stale starts", () => {
    const now = new Date("2026-05-09T10:03:00.000Z").getTime();
    expect(isStaleRecordingStart(recording({ status: "active", livekit_egress_id: "egress", started_at: "2026-05-09T10:00:00.000Z" }), { now })).toBe(false);
    expect(isStaleRecordingStart(recording({ status: "failed", livekit_egress_id: null, started_at: "2026-05-09T10:00:00.000Z" }), { now })).toBe(false);
  });

  it("falls back to created_at when started_at is missing", () => {
    const now = new Date("2026-05-09T10:03:00.000Z").getTime();
    expect(isStaleRecordingStart(recording({ started_at: null, created_at: "2026-05-09T10:00:00.000Z" }), { now })).toBe(true);
    expect(isStaleRecordingStart(recording({ started_at: null, created_at: null }), { now })).toBe(false);
  });
  it("builds a recovery patch that preserves metadata", () => {
    expect(
      buildStaleRecordingStartRecoveryPatch(
        recording({ metadata: { requestedBy: "host" } }),
        "2026-05-09T10:05:00.000Z",
      ),
    ).toEqual({
      status: "failed",
      metadata: { requestedBy: "host", staleStartRecovered: true, recoveredAt: "2026-05-09T10:05:00.000Z" },
      updated_at: "2026-05-09T10:05:00.000Z",
    });
  });

});
