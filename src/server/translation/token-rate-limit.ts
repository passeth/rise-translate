export const DEFAULT_TRANSLATION_TOKEN_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_TRANSLATION_TOKEN_LIMIT_PER_LISTENER = 12;

export class TranslationTokenRateLimitError extends Error {
  readonly status = 429;

  constructor(message = "Too many translation token requests. Please wait and try again.") {
    super(message);
    this.name = "TranslationTokenRateLimitError";
  }
}

export function getTranslationTokenWindowStart({
  now = Date.now(),
  windowMs = DEFAULT_TRANSLATION_TOKEN_LIMIT_WINDOW_MS,
}: {
  now?: number;
  windowMs?: number;
} = {}) {
  return new Date(now - windowMs).toISOString();
}

export function assertTranslationTokenRateLimit({
  issuedCount,
  limit = DEFAULT_TRANSLATION_TOKEN_LIMIT_PER_LISTENER,
}: {
  issuedCount: number;
  limit?: number;
}) {
  if (issuedCount >= limit) {
    throw new TranslationTokenRateLimitError();
  }
}
