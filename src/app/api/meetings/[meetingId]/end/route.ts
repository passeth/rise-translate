import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { generateMeetingNotesForMeeting } from "@/server/notes/generator";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { logOperationalEvent } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { publishTranslationStatus } from "@/server/translation/livekit-status";
import { stopTranslationRouterForMeeting } from "@/server/translation/router";
import { disconnectRoomParticipants } from "@/server/livekit/room-control";
import { getBlockingRecording, toAvailableRecordingPatch, updateMeetingRecordingStatus } from "@/server/recordings/repository";
import { stopRoomRecording } from "@/server/recordings/livekit-egress";
import { publishRecordingStatus } from "@/server/recordings/livekit-status";
import { shouldStopLiveKitRecording } from "@/server/recordings/meeting-end";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

type MeetingOwner = {
  host_id: string;
  livekit_room_name: string;
};

export async function POST(_: NextRequest, context: RouteContext) {
  const { meetingId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("host_id, livekit_room_name")
    .eq("id", meetingId)
    .maybeSingle<MeetingOwner>();

  if (!meeting || meeting.host_id !== user.id) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("rt_meetings")
    .update({
      lifecycle_status: "ended",
      link_disabled_at: now,
      ended_at: now,
      notes_status: "generating",
      updated_at: now,
    })
    .eq("id", meetingId);

  if (error) {
    await logOperationalEvent({
      supabase: admin,
      meetingId,
      roomName: meeting.livekit_room_name,
      featureArea: "meeting",
      eventType: "meeting_end_failed",
      severity: "error",
      errorType: "supabase_error",
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activeRecording = await getBlockingRecording(meetingId).catch(() => null);
  if (shouldStopLiveKitRecording(activeRecording)) {
    const stoppedAt = new Date().toISOString();
    await admin
      .from("rt_recordings")
      .update({ status: "processing", stopped_at: stoppedAt, updated_at: stoppedAt })
      .eq("id", activeRecording.id);
    await updateMeetingRecordingStatus(meetingId, "processing");

    try {
      const egress = await stopRoomRecording(activeRecording.livekit_egress_id);
      const patch =
        egress.status === "available"
          ? toAvailableRecordingPatch(activeRecording.started_at)
          : { status: egress.status, updated_at: new Date().toISOString() };
      await admin.from("rt_recordings").update(patch).eq("id", activeRecording.id);
      await updateMeetingRecordingStatus(meetingId, patch.status);
      await publishRecordingStatus(meeting.livekit_room_name, {
        type: "recording_status",
        meetingId,
        status: patch.status,
        message: "Meeting ended; recording stopped.",
        occurredAt: new Date().toISOString(),
      }).catch(() => undefined);
    } catch (recordingError) {
      const message = recordingError instanceof Error ? recordingError.message : "Unable to stop recording when meeting ended.";
      await admin
        .from("rt_recordings")
        .update({
          status: "failed",
          metadata: { ...(activeRecording.metadata ?? {}), meetingEndStopError: message },
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeRecording.id);
      await updateMeetingRecordingStatus(meetingId, "failed");
      await logOperationalEvent({
        supabase: admin,
        meetingId,
        roomName: meeting.livekit_room_name,
        featureArea: "recording",
        eventType: "meeting_end_recording_stop_failed",
        severity: "error",
        errorType: recordingError instanceof Error ? recordingError.name : "unknown_error",
        message,
        metadata: { recordingId: activeRecording.id },
      });
    }
  }


  await stopTranslationRouterForMeeting(meetingId).catch(async (shutdownError) => {
    await logOperationalEvent({
      supabase: admin,
      meetingId,
      roomName: meeting.livekit_room_name,
      featureArea: "cleanup",
      eventType: "translation_shutdown_failed",
      severity: "error",
      errorType: shutdownError instanceof Error ? shutdownError.name : "unknown_error",
      message: shutdownError instanceof Error ? shutdownError.message : "Unable to stop translation sessions.",
    });
  });
  await publishTranslationStatus(meeting.livekit_room_name, {
    type: "translation_status",
    meetingId,
    status: "stopped",
    message: "Meeting ended; translation sessions stopped.",
    occurredAt: now,
  }).catch(() => undefined);

  await admin
    .from("rt_meeting_participants")
    .update({ status: "removed", left_at: now, last_seen_at: now })
    .eq("meeting_id", meetingId)
    .in("status", ["joining", "active"]);

  await admin
    .from("rt_guest_sessions")
    .update({ status: "expired", left_at: now, last_seen_at: now })
    .eq("meeting_id", meetingId)
    .in("status", ["created", "active", "left"]);

  const disconnectResult = await disconnectRoomParticipants(meeting.livekit_room_name).catch(async (disconnectError) => {
    await logOperationalEvent({
      supabase: admin,
      meetingId,
      roomName: meeting.livekit_room_name,
      featureArea: "livekit",
      eventType: "meeting_end_disconnect_failed",
      severity: "warning",
      errorType: disconnectError instanceof Error ? disconnectError.name : "unknown_error",
      message: disconnectError instanceof Error ? disconnectError.message : "Unable to disconnect LiveKit participants.",
    });
    return null;
  });

  if (disconnectResult?.failed.length) {
    await logOperationalEvent({
      supabase: admin,
      meetingId,
      roomName: meeting.livekit_room_name,
      featureArea: "livekit",
      eventType: "meeting_end_disconnect_partial",
      severity: "warning",
      errorType: "livekit_remove_participant_error",
      message: "Some LiveKit participants could not be removed when the meeting ended.",
      metadata: disconnectResult,
    });
  }



  const notesResult = await generateMeetingNotesForMeeting(meetingId)
    .then(() => ({ status: "complete" as const }))
    .catch((notesError) => ({
      status: "failed" as const,
      error: notesError instanceof Error ? notesError.message : "Unable to generate meeting notes.",
    }));

  await logOperationalEvent({
    supabase: admin,
    meetingId,
    roomName: meeting.livekit_room_name,
    featureArea: "cleanup",
    eventType: "meeting_end_cleanup_requested",
    severity: notesResult.status === "failed" ? "warning" : "info",
    errorType: notesResult.status === "failed" ? "notes_generation_error" : null,
    message:
      notesResult.status === "failed"
        ? notesResult.error
        : "Meeting ended; notes generation and translation shutdown completed.",
    metadata: { notesStatus: notesResult.status, disconnectResult },
  });
  await recordUsageSnapshot({ supabase: admin, meetingId, reason: "meeting_end" });

  return NextResponse.json({ ok: true, notes: notesResult });
}
