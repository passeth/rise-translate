import { NextResponse } from "next/server";
import { getMarkdownFilename } from "@/server/notes/generator";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

type MeetingRow = {
  id: string;
  host_id: string;
  title: string;
};

type NotesRow = {
  status: string;
  markdown: string | null;
  generated_at: string | null;
};

export async function GET(request: Request, context: RouteContext) {
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
    .select("id, host_id, title")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();

  if (!meeting || meeting.host_id !== user.id) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const { data: notes, error } = await admin
    .from("rt_meeting_notes")
    .select("status, markdown, generated_at")
    .eq("meeting_id", meeting.id)
    .maybeSingle<NotesRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!notes?.markdown || notes.status !== "complete") {
    return NextResponse.json({ error: "Meeting notes are not available" }, { status: 404 });
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  const filename = getMarkdownFilename(meeting.title, notes.generated_at);

  return new NextResponse(notes.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
