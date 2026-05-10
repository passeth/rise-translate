export type RecordingStatus = "off" | "active" | "processing" | "available" | "expired" | "deleted" | "failed";

export type RecordingStatusEvent = {
  type: "recording_status";
  meetingId: string;
  status: RecordingStatus;
  message?: string;
  occurredAt: string;
};

export const RECORDING_RETENTION_DAYS = 7;

export function calculateRecordingExpiry(startedAt: string | Date, retentionDays = RECORDING_RETENTION_DAYS) {
  const started = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  return new Date(started.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

export function mapLiveKitEgressStatus(status: number | string | undefined): RecordingStatus {
  if (status === 1 || status === "EGRESS_ACTIVE") return "active";
  if (status === 0 || status === 2 || status === "EGRESS_STARTING" || status === "EGRESS_ENDING") return "processing";
  if (status === 3 || status === "EGRESS_COMPLETE") return "available";
  if (status === 4 || status === 5 || status === 6 || status === "EGRESS_FAILED" || status === "EGRESS_ABORTED" || status === "EGRESS_LIMIT_REACHED") {
    return "failed";
  }
  return "processing";
}
