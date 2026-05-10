import { NextResponse, type NextRequest } from "next/server";
import { publishRecordingStatus } from "@/server/recordings/livekit-status";
import { getBlockingRecording, toAvailableRecordingPatch, updateMeetingRecordingStatus } from "@/server/recordings/repository";
import { stopRoomRecording } from "@/server/recordings/livekit-egress";
import { shouldStopLiveKitRecording } from "@/server/recordings/meeting-end";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

type RouteContext = { params: Promise<{ meetingId: string }> };
type MeetingRow = { id: string; host_id: string; livekit_room_name: string };

export async function POST(_: NextRequest, context: RouteContext) {
  const { meetingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("id, host_id, livekit_room_name")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();
  if (!meeting || meeting.host_id !== user.id) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  const recording = await getBlockingRecording(meeting.id);
  if (!shouldStopLiveKitRecording(recording)) {
    return NextResponse.json({ error: "No active recording found" }, { status: 409 });
  }

  const stoppedAt = new Date().toISOString();
  await admin.from("rt_recordings").update({ status: "processing", stopped_at: stoppedAt, updated_at: stoppedAt }).eq("id", recording.id);
  await updateMeetingRecordingStatus(meeting.id, "processing");

  try {
    const egress = await stopRoomRecording(recording.livekit_egress_id);
    const patch = egress.status === "available" ? toAvailableRecordingPatch(recording.started_at) : { status: egress.status, updated_at: new Date().toISOString() };
    await admin.from("rt_recordings").update(patch).eq("id", recording.id);
    await updateMeetingRecordingStatus(meeting.id, patch.status);
    await publishRecordingStatus(meeting.livekit_room_name, {
      type: "recording_status",
      meetingId: meeting.id,
      status: patch.status,
      message: patch.status === "available" ? "Recording is available for host playback." : "Recording stopped and is processing.",
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    return NextResponse.json({ recordingId: recording.id, status: patch.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to stop recording";
    await admin.from("rt_recordings").update({ status: "failed", metadata: { ...(recording.metadata ?? {}), stopError: message }, updated_at: new Date().toISOString() }).eq("id", recording.id);
    await updateMeetingRecordingStatus(meeting.id, "failed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
