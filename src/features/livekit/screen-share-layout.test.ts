import { Track } from "livekit-client";
import { describe, expect, it } from "vitest";
import { groupTracksForScreenShareLayout, shouldUseScreenShareStage, type TrackSourceLike } from "./screen-share-layout";

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
});
