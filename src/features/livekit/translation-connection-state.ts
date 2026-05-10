export const DEFAULT_TRANSLATION_DISCONNECTED_GRACE_MS = 5_000;

export function shouldScheduleTranslationReconnectForConnectionState(state: RTCPeerConnectionState) {
  return state === "failed" || state === "closed";
}

export function shouldWaitBeforeReconnectForConnectionState(state: RTCPeerConnectionState) {
  return state === "disconnected";
}
