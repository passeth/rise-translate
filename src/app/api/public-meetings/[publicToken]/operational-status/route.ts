import { NextResponse, type NextRequest } from "next/server";
import { resolvePublicMeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { summarizeCaptionStatus, summarizeTranslationStatus } from "@/features/livekit/operational-status";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ publicToken: string }>;
};

type MeetingStatusRow = {
  id: string;
  livekit_room_name: string;
  lifecycle_status: string;
  notes_status: string;
  recording_status: string;
};

type TranslationStatusRow = {
  status: string;
  updated_at: string;
  worker_heartbeat_at: string | null;
  source_identity: string;
  target_language: string;
};

type CaptionStatusRow = {
  started_at: string;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { publicToken } = await context.params;
  const access = await resolvePublicMeetingActor(publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: meeting, error: meetingError } = await admin
    .from("rt_meetings")
    .select("id, livekit_room_name, lifecycle_status, notes_status, recording_status")
    .eq("id", access.meeting.id)
    .maybeSingle<MeetingStatusRow>();

  if (meetingError || !meeting) {
    return NextResponse.json({ error: meetingError?.message ?? "Meeting not found" }, { status: 404 });
  }

  const [{ data: translationSessions }, { data: captionSegments }] = await Promise.all([
    admin
      .from("rt_translation_sessions")
      .select("status, updated_at, worker_heartbeat_at, source_identity, target_language")
      .eq("meeting_id", meeting.id)
      .returns<TranslationStatusRow[]>(),
    admin
      .from("rt_transcript_segments")
      .select("started_at")
      .eq("meeting_id", meeting.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .returns<CaptionStatusRow[]>(),
  ]);

  return NextResponse.json({
    meetingId: meeting.id,
    roomName: meeting.livekit_room_name,
    lifecycleStatus: meeting.lifecycle_status,
    captions: summarizeCaptionStatus(captionSegments ?? []),
    translation: summarizeTranslationStatus(translationSessions ?? []),
    recording: {
      status: meeting.recording_status,
      message: describeRecording(meeting.recording_status),
    },
    notes: {
      status: meeting.notes_status,
      message: describeNotes(meeting.notes_status),
    },
  });
}


function describeRecording(status: string) {
  if (status === "active") return "Recording is active.";
  if (status === "failed") return "Recording failed.";
  if (status === "processing") return "Recording is processing.";
  return "Recording is not active.";
}

function describeNotes(status: string) {
  if (status === "generating") return "Meeting notes are processing.";
  if (status === "failed") return "Meeting notes generation failed.";
  if (status === "complete") return "Meeting notes are ready for the host.";
  return "Meeting notes have not started.";
}
