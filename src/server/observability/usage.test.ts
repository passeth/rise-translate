import { describe, expect, it } from "vitest";
import { buildTranslationChannelActivity, buildUsageSnapshotPayload, secondsBetween } from "./usage";

describe("usage snapshots", () => {
  it("calculates non-negative meeting and recording durations", () => {
    expect(secondsBetween("2026-05-09T00:00:00.000Z", "2026-05-09T00:01:05.000Z")).toBe(65);
    expect(secondsBetween("2026-05-09T00:02:00.000Z", "2026-05-09T00:01:00.000Z")).toBe(0);
    expect(secondsBetween(null, "2026-05-09T00:01:00.000Z")).toBe(0);
  });

  it("captures participant, recording, and translation activity", () => {
    const snapshot = buildUsageSnapshotPayload({
      capturedAt: "2026-05-09T01:00:00.000Z",
      reason: "meeting_end",
      meeting: {
        id: "meeting-1",
        livekit_room_name: "lk_room",
        started_at: "2026-05-09T00:00:00.000Z",
        ended_at: "2026-05-09T00:30:00.000Z",
      },
      participants: [{ status: "active" }, { status: "left" }, { status: "joining" }],
      recordings: [
        { status: "available", started_at: "2026-05-09T00:05:00.000Z", stopped_at: "2026-05-09T00:25:00.000Z" },
      ],
      translationSessions: [
        { status: "connected", source_language: "ko", target_language: "ru" },
        { status: "failed", source_language: "ru", target_language: "ko" },
      ],
    });

    expect(snapshot).toMatchObject({
      meeting_id: "meeting-1",
      room_name: "lk_room",
      meeting_duration_seconds: 1800,
      active_participant_count: 2,
      total_participant_count: 3,
      recording_duration_seconds: 1200,
      translation_session_count: 2,
      translation_connected_count: 1,
      translation_failed_count: 1,
    });
    expect(snapshot.translation_channel_activity).toEqual({
      byStatus: { connected: 1, failed: 1 },
      byTargetLanguage: { ru: 1, ko: 1 },
      bySourceTarget: { "ko->ru": 1, "ru->ko": 1 },
    });
  });

  it("groups translation channel activity", () => {
    expect(
      buildTranslationChannelActivity([
        { status: "connected", source_language: "ko", target_language: "en" },
        { status: "connected", source_language: "ja", target_language: "en" },
      ]),
    ).toMatchObject({ byStatus: { connected: 2 }, byTargetLanguage: { en: 2 } });
  });
});
