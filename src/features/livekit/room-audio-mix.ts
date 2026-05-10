export type RoomAudioMixSnapshot = {
  enabled: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  status: string;
};

export function hasActiveBrowserTranslationMix(snapshots: RoomAudioMixSnapshot[]) {
  return snapshots.some(
    (snapshot) =>
      snapshot.enabled &&
      snapshot.sourceLanguage !== snapshot.targetLanguage &&
      ["connecting", "reconnecting", "connected"].includes(snapshot.status),
  );
}

export function resolveRoomAudioVolume({
  serverTranslationTrackActive,
  browserTranslationMixActive,
  translatedAudioVolume,
  sourceAudioVolume,
}: {
  serverTranslationTrackActive: boolean;
  browserTranslationMixActive: boolean;
  translatedAudioVolume: number;
  sourceAudioVolume: number;
}) {
  if (serverTranslationTrackActive) return translatedAudioVolume;
  if (browserTranslationMixActive) return sourceAudioVolume;
  return 1;
}
