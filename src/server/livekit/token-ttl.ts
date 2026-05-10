const DEFAULT_LIVEKIT_TOKEN_TTL = "12h";
const LIVEKIT_TOKEN_TTL_PATTERN = /^\d+(?:s|m|h|d)$/;

export function getLiveKitTokenTtl(value = process.env.LIVEKIT_TOKEN_TTL) {
  const ttl = value?.trim() || DEFAULT_LIVEKIT_TOKEN_TTL;
  return LIVEKIT_TOKEN_TTL_PATTERN.test(ttl) ? ttl : DEFAULT_LIVEKIT_TOKEN_TTL;
}
