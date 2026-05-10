import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getServerTranslationReadiness } from "@/server/translation/readiness";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

type MeetingRow = {
  id: string;
  host_id: string;
};

type ParticipantRow = {
  id: string;
  display_name: string;
  company: string;
  role: string;
  livekit_identity: string;
  speaking_language: string | null;
  listening_language: string | null;
  status: string;
  joined_at: string | null;
};

type SessionRow = {
  id: string;
  source_identity: string;
  source_language: string;
  target_language: string;
  target_track_name: string;
  status: string;
  last_error: string | null;
  updated_at: string;
  worker_heartbeat_at: string | null;
};

export async function GET(_: Request, context: RouteContext) {
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
    .select("id, host_id")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();

  if (!meeting || meeting.host_id !== user.id) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const [{ data, error }, { data: participants, error: participantsError }] = await Promise.all([
    admin
      .from("rt_translation_sessions")
      .select("id, source_identity, source_language, target_language, target_track_name, status, last_error, updated_at, worker_heartbeat_at")
      .eq("meeting_id", meeting.id)
      .order("updated_at", { ascending: false })
      .returns<SessionRow[]>(),
    admin
      .from("rt_meeting_participants")
      .select("id, display_name, company, role, livekit_identity, speaking_language, listening_language, status, joined_at")
      .eq("meeting_id", meeting.id)
      .in("status", ["joining", "active"])
      .order("joined_at", { ascending: false })
      .returns<ParticipantRow[]>(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (participantsError) {
    return NextResponse.json({ error: participantsError.message }, { status: 500 });
  }

  return NextResponse.json({
    serverReadiness: getServerTranslationReadiness({ allowDryRun: false }),
    sessions: data ?? [],
    participants: (participants ?? []).map((participant) => ({
      ...participant,
      speaking_language: participant.speaking_language ?? (participant.role === "host" ? "ko" : null),
      listening_language: participant.listening_language ?? (participant.role === "host" ? "ko" : null),
    })),
  });
}
