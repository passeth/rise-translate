import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { logOperationalEvent } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { buildRecordingStorageRemovalPlan } from "@/server/recordings/expiry";
import { isInternalWorkerAuthorized } from "@/server/operations/internal-auth";

export const dynamic = "force-dynamic";

type ExpiredRecordingRow = {
  id: string;
  meeting_id: string;
  bucket: string | null;
  object_key: string | null;
  rt_meetings: {
    livekit_room_name: string;
  } | null;
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!isInternalWorkerAuthorized({ authorizationHeader: authHeader, expectedToken: process.env.INTERNAL_WORKER_TOKEN })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: expiredRecordings, error: selectError } = await admin
    .from("rt_recordings")
    .select("id, meeting_id, bucket, object_key, rt_meetings(livekit_room_name)")
    .eq("status", "available")
    .lte("expires_at", now)
    .returns<ExpiredRecordingRow[]>();

  if (selectError) {
    await logOperationalEvent({
      supabase: admin,
      featureArea: "recording",
      eventType: "recording_expiry_select_failed",
      severity: "error",
      errorType: "supabase_error",
      message: selectError.message,
    });
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const rows = expiredRecordings ?? [];

  if (rows.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  const removalPlans = buildRecordingStorageRemovalPlan(rows);
  const removalFailures: Array<{ bucket: string; recordingIds: string[]; message: string }> = [];

  await Promise.all(
    removalPlans.map(async (plan) => {
      const { error } = await admin.storage.from(plan.bucket).remove(plan.objectKeys);
      if (error) {
        removalFailures.push({ bucket: plan.bucket, recordingIds: plan.recordingIds, message: error.message });
      }
    }),
  );

  for (const failure of removalFailures) {
    await logOperationalEvent({
      supabase: admin,
      featureArea: "recording",
      eventType: "recording_storage_delete_failed",
      severity: "error",
      errorType: "storage_error",
      message: failure.message,
      metadata: { bucket: failure.bucket, recordingIds: failure.recordingIds },
    });
  }

  const ids = rows.map((recording) => recording.id);
  const { error: updateError } = await admin
    .from("rt_recordings")
    .update({ status: "expired", deleted_at: now, updated_at: now })
    .in("id", ids);

  if (updateError) {
    await logOperationalEvent({
      supabase: admin,
      featureArea: "recording",
      eventType: "recording_expiry_failed",
      severity: "error",
      errorType: "supabase_error",
      message: updateError.message,
      metadata: { recordingIds: ids },
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await Promise.all(
    rows.map(async (recording) => {
      await admin
        .from("rt_meetings")
        .update({ recording_status: "expired", updated_at: now })
        .eq("id", recording.meeting_id)
        .neq("recording_status", "failed");
      await logOperationalEvent({
        supabase: admin,
        meetingId: recording.meeting_id,
        roomName: recording.rt_meetings?.livekit_room_name,
        featureArea: "cleanup",
        eventType: "recording_expired",
        message: "Recording passed the 7-day retention window and was marked expired.",
        metadata: { recordingId: recording.id, hasObjectKey: Boolean(recording.object_key) },
      });
      await recordUsageSnapshot({
        supabase: admin,
        meetingId: recording.meeting_id,
        reason: "recording_expiry",
        metadata: { recordingId: recording.id },
      });
    }),
  );

  return NextResponse.json({
    expired: rows.length,
    recordingIds: ids,
    storageDeleteFailures: removalFailures.length,
  });
}
