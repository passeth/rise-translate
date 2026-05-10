export const REALTIME_PCM_FORMAT = {
  encoding: "pcm16",
  sampleRate: 24_000,
  channels: 1,
} as const;

export type RealtimePcmFormat = typeof REALTIME_PCM_FORMAT;

export function describeRealtimePcmFormat(format: RealtimePcmFormat = REALTIME_PCM_FORMAT) {
  return `${format.encoding} ${format.sampleRate}Hz mono (${format.channels} channel)`;
}
