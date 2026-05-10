export const PUBLIC_CHAT_MESSAGE_MAX_LENGTH = 2_000;
export const PUBLIC_TRANSCRIPT_TEXT_MAX_LENGTH = 4_000;

export function trimAndLimitPublicText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return { ok: false as const, value: "", reason: "missing" as const };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false as const, value: "", reason: "blank" as const };
  if (trimmed.length > maxLength) return { ok: false as const, value: trimmed, reason: "too_long" as const };
  return { ok: true as const, value: trimmed };
}
