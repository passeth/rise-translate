import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { calculateRecordingExpiry, type RecordingStatus } from "@/features/recordings/status";
import { BLOCKING_RECORDING_STATUSES } from "@/server/recordings/active-status";

export type RecordingRow = {
  id: string;
  meeting_id: string;
  livekit_egress_id: string | null;
  storage_provider: string;
  bucket: string | null;
  object_key: string | null;
  status: RecordingStatus;
  started_at: string | null;
  stopped_at: string | null;
  available_at: string | null;
  expires_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
  metadata: Record<string, unknown>;
};

const RECORDING_ROW_SELECT =
  "id, meeting_id, livekit_egress_id, storage_provider, bucket, object_key, status, started_at, stopped_at, available_at, expires_at, deleted_at, created_at, metadata";

export async function getLatestRecording(meetingId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("rt_recordings")
    .select(RECORDING_ROW_SELECT)
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RecordingRow>();

  if (error) throw error;
  return data;
}


export async function getBlockingRecording(meetingId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("rt_recordings")
    .select(RECORDING_ROW_SELECT)
    .eq("meeting_id", meetingId)
    .in("status", [...BLOCKING_RECORDING_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RecordingRow>();

  if (error) throw error;
  return data;
}

export async function updateMeetingRecordingStatus(meetingId: string, status: RecordingStatus) {
  const admin = createSupabaseAdminClient();
  await admin.from("rt_meetings").update({ recording_status: status, updated_at: new Date().toISOString() }).eq("id", meetingId);
}

export function toAvailableRecordingPatch(startedAt: string | null) {
  const now = new Date().toISOString();
  return {
    status: "available" as const,
    available_at: now,
    expires_at: calculateRecordingExpiry(startedAt ?? now),
    updated_at: now,
  };
}
