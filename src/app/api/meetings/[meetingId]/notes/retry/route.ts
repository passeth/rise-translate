import { NextResponse } from "next/server";
import { generateMeetingNotesForMeeting } from "@/server/notes/generator";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

type MeetingRow = {
  id: string;
  host_id: string;
  lifecycle_status: string;
  notes_status: string;
};

export async function POST(_: Request, context: RouteContext) {
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
    .select("id, host_id, lifecycle_status, notes_status")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();

  if (!meeting || meeting.host_id !== user.id) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.lifecycle_status !== "ended") {
    return NextResponse.json({ error: "Notes can be generated after the meeting ends" }, { status: 409 });
  }

  if (meeting.notes_status === "generating") {
    return NextResponse.json({ error: "Notes generation is already running" }, { status: 409 });
  }

  try {
    await generateMeetingNotesForMeeting(meeting.id, { retry: true });
    return NextResponse.json({ ok: true, notesStatus: "complete" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate meeting notes.";
    return NextResponse.json({ ok: false, notesStatus: "failed", error: message }, { status: 500 });
  }
}
