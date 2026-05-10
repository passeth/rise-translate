import type { RecordingRow } from "@/server/recordings/repository";

export const STALE_RECORDING_START_TIMEOUT_MS = 2 * 60 * 1000;

export type StaleRecordingStart = RecordingRow & { status: "active"; livekit_egress_id: null };

export function isStaleRecordingStart(
  recording: RecordingRow | null | undefined,
  { now = Date.now(), timeoutMs = STALE_RECORDING_START_TIMEOUT_MS }: { now?: number; timeoutMs?: number } = {},
): recording is StaleRecordingStart {
  if (recording?.status !== "active" || recording.livekit_egress_id) return false;
  const startedAt = parseTimestamp(recording.started_at) ?? parseTimestamp(recording.created_at);
  return startedAt !== null && now - startedAt > timeoutMs;
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}


export function buildStaleRecordingStartRecoveryPatch(
  recording: Pick<RecordingRow, "metadata">,
  recoveredAt = new Date().toISOString(),
) {
  return {
    status: "failed" as const,
    metadata: { ...(recording.metadata ?? {}), staleStartRecovered: true, recoveredAt },
    updated_at: recoveredAt,
  };
}
