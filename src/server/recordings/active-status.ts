import type { RecordingStatus } from "@/features/recordings/status";

export const BLOCKING_RECORDING_STATUSES = ["active", "processing"] as const satisfies readonly RecordingStatus[];

export function isBlockingRecordingStatus(status: string | null | undefined) {
  return status === "active" || status === "processing";
}


export function isRecordingBlockingUniqueConflict(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "23505" &&
    (error.message?.includes("rt_recordings_one_blocking_per_meeting_idx") ?? false)
  );
}
