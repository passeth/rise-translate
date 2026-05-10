import { NextResponse, type NextRequest } from "next/server";
import { logOperationalEvent } from "@/server/observability/events";
import { getRecordingStorageReadiness, listRoomRecordingStatus } from "@/server/recordings/livekit-egress";
import { buildRecordingStorageSetupGuide } from "@/server/recordings/storage-setup";
import { getLatestRecording, toAvailableRecordingPatch, updateMeetingRecordingStatus } from "@/server/recordings/repository";
import { buildStaleRecordingStartRecoveryPatch, isStaleRecordingStart } from "@/server/recordings/stale-start";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

type RouteContext = { params: Promise<{ meetingId: string }> };
type MeetingRow = { id: string; host_id: string; livekit_room_name: string; recording_status: string };

export async function GET(_: NextRequest, context: RouteContext) {
  const { meetingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("id, host_id, livekit_room_name, recording_status")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();
  if (!meeting || meeting.host_id !== user.id) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  let recording = await getLatestRecording(meeting.id);
  if (isStaleRecordingStart(recording)) {
    const recoveredAt = new Date().toISOString();
    await admin
      .from("rt_recordings")
      .update(buildStaleRecordingStartRecoveryPatch(recording, recoveredAt))
      .eq("id", recording.id);
    await updateMeetingRecordingStatus(meeting.id, "failed");
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "recording",
      eventType: "recording_stale_start_recovered_from_status",
      severity: "warning",
      message: "Recovered a stale active recording row without a LiveKit egress id during status polling.",
      metadata: {
        staleRecordingId: recording.id,
        startedAt: recording.started_at,
        createdAt: recording.created_at,
        recoveredAt,
      },
    }).catch(() => undefined);
    recording = await getLatestRecording(meeting.id);
  }

  if (recording?.livekit_egress_id && ["active", "processing"].includes(recording.status)) {
    const live = await listRoomRecordingStatus(meeting.livekit_room_name, recording.livekit_egress_id).catch(() => null);
    if (live && live.status !== recording.status) {
      const patch = live.status === "available" ? toAvailableRecordingPatch(recording.started_at) : { status: live.status, updated_at: new Date().toISOString() };
      await admin.from("rt_recordings").update(patch).eq("id", recording.id);
      await updateMeetingRecordingStatus(meeting.id, patch.status);
      recording = await getLatestRecording(meeting.id);
    }
  }

  let playbackUrl: string | null = null;
  if (recording?.status === "available" && recording.bucket && recording.object_key) {
    const { data } = await admin.storage.from(recording.bucket).createSignedUrl(recording.object_key, 60 * 10);
    playbackUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({
    meetingStatus: recording?.status ?? meeting.recording_status,
    storage: getRecordingStorageReadiness(),
    setup: (() => {
      const guide = buildRecordingStorageSetupGuide();
      return { dashboardUrl: guide.dashboardUrl, docsUrl: guide.docsUrl };
    })(),
    recording: recording
      ? {
          id: recording.id,
          status: recording.status,
          startedAt: recording.started_at,
          stoppedAt: recording.stopped_at,
          availableAt: recording.available_at,
          expiresAt: recording.expires_at,
          playbackUrl,
        }
      : null,
  });
}
