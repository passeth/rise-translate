import { Track } from "livekit-client";

export type TrackSourceLike = {
  source: Track.Source;
};

export type ScreenShareTrackGroups<T extends TrackSourceLike> = {
  screenShareTracks: T[];
  cameraTracks: T[];
};

export function groupTracksForScreenShareLayout<T extends TrackSourceLike>(tracks: T[]): ScreenShareTrackGroups<T> {
  const screenShareTracks = tracks.filter((track) => track.source === Track.Source.ScreenShare);
  const cameraTracks = tracks.filter((track) => track.source !== Track.Source.ScreenShare);

  return { screenShareTracks, cameraTracks };
}

export function shouldUseScreenShareStage<T extends TrackSourceLike>(tracks: T[]) {
  return tracks.some((track) => track.source === Track.Source.ScreenShare);
}
