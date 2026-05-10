import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { logOperationalEvent } from "@/server/observability/events";
import { createRecordingObjectKey, getRecordingStorageConfig, startRoomRecording } from "@/server/recordings/livekit-egress";
import { publishRecordingStatus } from "@/server/recordings/livekit-status";
import { getBlockingRecording, updateMeetingRecordingStatus } from "@/server/recordings/repository";
import { isRecordingBlockingUniqueConflict } from "@/server/recordings/active-status";
import { buildStaleRecordingStartRecoveryPatch, isStaleRecordingStart } from "@/server/recordings/stale-start";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

type RouteContext = { params: Promise<{ meetingId: string }> };
type MeetingRow = { id: string; host_id: string; livekit_room_name: string; lifecycle_status: string };

export async function POST(_: NextRequest, context: RouteContext) {
  const { meetingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("id, host_id, livekit_room_name, lifecycle_status")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();

  if (!meeting || meeting.host_id !== user.id) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  if (meeting.lifecycle_status === "ended") return NextResponse.json({ error: "Meeting has ended" }, { status: 409 });

  const active = await getBlockingRecording(meeting.id);
  if (isStaleRecordingStart(active)) {
    const recoveredAt = new Date().toISOString();
    await admin
      .from("rt_recordings")
      .update(buildStaleRecordingStartRecoveryPatch(active, recoveredAt))
      .eq("id", active.id);
    await updateMeetingRecordingStatus(meeting.id, "failed");
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "recording",
      eventType: "recording_stale_start_recovered",
      severity: "warning",
      message: "Recovered a stale active recording row without a LiveKit egress id before starting a new recording.",
      metadata: {
        staleRecordingId: active.id,
        startedAt: active.started_at,
        createdAt: active.created_at,
        recoveredAt,
      },
    }).catch(() => undefined);
  } else if (active) {
    return NextResponse.json({ error: "Recording is already active or processing" }, { status: 409 });
  }

  const storage = getRecordingStorageConfig();
  if (!storage) {
    await updateMeetingRecordingStatus(meeting.id, "failed");
    return NextResponse.json({ error: "Recording storage is not configured" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const recordingId = randomUUID();
  const objectKey = createRecordingObjectKey(meeting.id, recordingId, new Date(now));

  const { error: insertError } = await admin.from("rt_recordings").insert({
    id: recordingId,
    meeting_id: meeting.id,
    started_by_host_id: user.id,
    storage_provider: "supabase-s3",
    bucket: storage.bucket,
    object_key: objectKey,
    status: "active",
    started_at: now,
    metadata: {
      capture: "room-composite",
      layout: "grid",
      audio: "original-room-audio-only",
      captionsIncluded: false,
      translationAudioIncluded: false,
    },
  });
  if (insertError) {
    if (isRecordingBlockingUniqueConflict(insertError)) {
      return NextResponse.json({ error: "Recording is already active or processing" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    const egress = await startRoomRecording({ roomName: meeting.livekit_room_name, meetingId: meeting.id, recordingId, objectKey });
    await admin.from("rt_recordings").update({ livekit_egress_id: egress.egressId, status: egress.status, updated_at: new Date().toISOString() }).eq("id", recordingId);
    await updateMeetingRecordingStatus(meeting.id, egress.status);
    await publishRecordingStatus(meeting.livekit_room_name, {
      type: "recording_status",
      meetingId: meeting.id,
      status: egress.status,
      message: "Recording started.",
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    return NextResponse.json({ recordingId, egressId: egress.egressId, status: egress.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start recording";
    await admin.from("rt_recordings").update({ status: "failed", metadata: { error: message }, updated_at: new Date().toISOString() }).eq("id", recordingId);
    await updateMeetingRecordingStatus(meeting.id, "failed");
    await publishRecordingStatus(meeting.livekit_room_name, {
      type: "recording_status",
      meetingId: meeting.id,
      status: "failed",
      message,
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
