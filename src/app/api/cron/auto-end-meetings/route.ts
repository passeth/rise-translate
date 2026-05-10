import { NextResponse } from "next/server";
import { generateMeetingNotesForMeeting } from "@/server/notes/generator";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { logOperationalEvent } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { isInternalWorkerAuthorized } from "@/server/operations/internal-auth";

export const dynamic = "force-dynamic";

type MeetingRow = {
  id: string;
  livekit_room_name: string;
};

export async function POST(request: Request) {
  if (!isInternalWorkerAuthorized({
    authorizationHeader: request.headers.get("authorization"),
    expectedToken: process.env.INTERNAL_WORKER_TOKEN,
  })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: staleMeetings, error: selectError } = await admin
    .from("rt_meetings")
    .select("id, livekit_room_name")
    .eq("lifecycle_status", "in_progress")
    .lte("empty_since_at", cutoff)
    .returns<MeetingRow[]>();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const staleRows = staleMeetings ?? [];
  const ids = staleRows.map((meeting) => meeting.id);

  if (ids.length === 0) {
    return NextResponse.json({ ended: 0 });
  }

  const { error: updateError } = await admin
    .from("rt_meetings")
    .update({
      lifecycle_status: "ended",
      link_disabled_at: now,
      ended_at: now,
      notes_status: "generating",
      updated_at: now,
    })
    .in("id", ids);

  if (updateError) {
    await logOperationalEvent({
      supabase: admin,
      featureArea: "cleanup",
      eventType: "auto_end_failed",
      severity: "error",
      errorType: "supabase_error",
      message: updateError.message,
      metadata: { meetingIds: ids },
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const notesResults = await Promise.allSettled(ids.map((id) => generateMeetingNotesForMeeting(id)));
  await Promise.all(
    staleRows.map(async (meeting, index) => {
      const result = notesResults[index];
      await logOperationalEvent({
        supabase: admin,
        meetingId: meeting.id,
        roomName: meeting.livekit_room_name,
        featureArea: "cleanup",
        eventType: "auto_end_meeting",
        severity: result.status === "rejected" ? "warning" : "info",
        errorType: result.status === "rejected" ? "notes_generation_error" : null,
        message:
          result.status === "rejected" && result.reason instanceof Error
            ? result.reason.message
            : "Meeting auto-ended after the room stayed empty.",
      });
      await recordUsageSnapshot({ supabase: admin, meetingId: meeting.id, reason: "auto_end" });
    }),
  );

  return NextResponse.json({
    ended: ids.length,
    meetingIds: ids,
    notes: notesResults.map((result, index) => ({
      meetingId: ids[index],
      status: result.status === "fulfilled" ? "complete" : "failed",
      error: result.status === "rejected" && result.reason instanceof Error ? result.reason.message : undefined,
    })),
  });
}
