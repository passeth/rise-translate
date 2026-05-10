const MIN_TRANSCRIPT_CHUNK_LENGTH = 24;
const TARGET_TRANSCRIPT_CHUNK_LENGTH = 80;
const SENTENCE_END_PATTERN = /[.!?。！？]\s*$/;

export function getTranscriptDelta(previous: string, next: string) {
  const normalizedPrevious = previous.trim();
  const normalizedNext = next.trim();

  if (!normalizedPrevious) return normalizedNext;
  if (normalizedNext.startsWith(normalizedPrevious)) {
    return normalizedNext.slice(normalizedPrevious.length).trim();
  }
  return normalizedNext;
}

export function shouldPersistTranscriptChunk({
  sourceDelta,
  translatedDelta,
}: {
  sourceDelta: string;
  translatedDelta?: string;
}) {
  const longest = Math.max(sourceDelta.trim().length, translatedDelta?.trim().length ?? 0);
  if (longest < MIN_TRANSCRIPT_CHUNK_LENGTH) return false;
  if (longest >= TARGET_TRANSCRIPT_CHUNK_LENGTH) return true;
  return SENTENCE_END_PATTERN.test(sourceDelta.trim()) || SENTENCE_END_PATTERN.test(translatedDelta?.trim() ?? "");
}
