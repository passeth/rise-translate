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

export type ParticipantGridLayout = {
  columns: number;
  rows: number;
  compact: boolean;
  width: string;
  height: string;
};

export function resolveParticipantGridLayout(trackCount: number, options: { compact?: boolean } = {}): ParticipantGridLayout {
  const safeCount = Math.max(1, trackCount);
  const compact = Boolean(options.compact);

  if (compact) {
    return {
      columns: 1,
      rows: safeCount,
      compact: true,
      width: "100%",
      height: "100%",
    };
  }

  const columns = safeCount <= 1 ? 1 : safeCount <= 4 ? 2 : safeCount <= 9 ? 3 : 4;
  const rows = Math.ceil(safeCount / columns);

  return {
    columns,
    rows,
    compact: false,
    width: "100%",
    height: "100%",
  };
}
