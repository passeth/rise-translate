import { Track } from "livekit-client";
import { describe, expect, it } from "vitest";
import {
  groupTracksForScreenShareLayout,
  resolveParticipantGridLayout,
  shouldUseScreenShareStage,
  type TrackSourceLike,
} from "./screen-share-layout";

describe("screen share meeting layout", () => {
  it("separates screen share tracks from camera tracks", () => {
    const camera = { source: Track.Source.Camera, id: "camera" } satisfies TrackSourceLike & { id: string };
    const screen = { source: Track.Source.ScreenShare, id: "screen" } satisfies TrackSourceLike & { id: string };

    const groups = groupTracksForScreenShareLayout([camera, screen]);

    expect(groups.screenShareTracks).toEqual([screen]);
    expect(groups.cameraTracks).toEqual([camera]);
    expect(shouldUseScreenShareStage([camera, screen])).toBe(true);
  });

  it("keeps normal grid mode when no one is sharing", () => {
    const tracks = [{ source: Track.Source.Camera }];

    expect(groupTracksForScreenShareLayout(tracks).screenShareTracks).toHaveLength(0);
    expect(shouldUseScreenShareStage(tracks)).toBe(false);
  });

  it("caps a single participant tile instead of stretching it full screen", () => {
    expect(resolveParticipantGridLayout(1)).toEqual({
      columns: 1,
      compact: false,
      width: "min(100%, 720px)",
      height: "min(100%, 440px)",
    });
  });

  it("uses meeting-style split grids as participant count grows", () => {
    expect(resolveParticipantGridLayout(2).columns).toBe(2);
    expect(resolveParticipantGridLayout(4).columns).toBe(2);
    expect(resolveParticipantGridLayout(5).columns).toBe(3);
    expect(resolveParticipantGridLayout(10).columns).toBe(4);
  });

  it("uses one compact column for the screen-share participant strip", () => {
    expect(resolveParticipantGridLayout(6, { compact: true })).toEqual({
      columns: 1,
      compact: true,
      width: "100%",
      height: "100%",
    });
  });
});
