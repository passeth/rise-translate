export const DEFAULT_TRANSLATION_RECONNECT_ATTEMPTS = 3;
export const DEFAULT_TRANSLATION_RECONNECT_BASE_DELAY_MS = 1_200;
export const DEFAULT_TRANSLATION_RECONNECT_MAX_DELAY_MS = 5_000;

export function shouldRetryTranslationConnection({
  attempt,
  maxAttempts = DEFAULT_TRANSLATION_RECONNECT_ATTEMPTS,
}: {
  attempt: number;
  maxAttempts?: number;
}) {
  return attempt < maxAttempts;
}

export function getTranslationReconnectDelayMs({
  attempt,
  baseDelayMs = DEFAULT_TRANSLATION_RECONNECT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_TRANSLATION_RECONNECT_MAX_DELAY_MS,
}: {
  attempt: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}) {
  const exponentialDelay = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(maxDelayMs, exponentialDelay);
}
