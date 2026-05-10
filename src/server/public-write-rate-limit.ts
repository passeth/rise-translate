export const PUBLIC_CHAT_RATE_LIMIT = { maxWrites: 20, windowMs: 60_000 } as const;
export const PUBLIC_TRANSCRIPT_RATE_LIMIT = { maxWrites: 120, windowMs: 60_000 } as const;

export function getPublicWriteRateLimitCutoff({ now = Date.now(), windowMs }: { now?: number; windowMs: number }) {
  return new Date(now - Math.max(1, windowMs)).toISOString();
}

export function isPublicWriteRateLimited({ count, maxWrites }: { count: number | null | undefined; maxWrites: number }) {
  return (count ?? 0) >= maxWrites;
}
