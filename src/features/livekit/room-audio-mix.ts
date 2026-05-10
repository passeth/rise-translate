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

export function shouldRunBrowserTranslationFallback({
  enabled,
  serverBridgePreferred,
  serverTranslatedSourceActive,
}: {
  enabled: boolean;
  serverBridgePreferred: boolean;
  serverTranslatedSourceActive: boolean;
}) {
  if (!enabled) return false;
  if (serverBridgePreferred) return false;
  return !serverTranslatedSourceActive;
}

export function resolveTrackAudioVolume({
  translationTrack,
  originalSourceActivelyInterpreted,
  browserTranslationMixActive,
  translatedAudioVolume,
  sourceAudioVolume,
}: {
  translationTrack: boolean;
  originalSourceActivelyInterpreted: boolean;
  browserTranslationMixActive: boolean;
  translatedAudioVolume: number;
  sourceAudioVolume: number;
}) {
  if (translationTrack) return translatedAudioVolume;
  if (originalSourceActivelyInterpreted || browserTranslationMixActive) return sourceAudioVolume;
  return 1;
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
