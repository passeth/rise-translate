import { NextResponse, type NextRequest } from "next/server";
import { resolvePublicMeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { logOperationalEvent } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";

export const dynamic = "force-dynamic";

type LeaveBody = {
  publicToken?: string;
  identity?: string;
};

type ActiveParticipant = {
  id: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LeaveBody;

  if (!body.publicToken || !body.identity) {
    return NextResponse.json({ error: "publicToken and identity are required" }, { status: 400 });
  }

  const access = await resolvePublicMeetingActor(body.publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  await admin
    .from("rt_meeting_participants")
    .update({ status: "left", left_at: now, last_seen_at: now })
    .eq("meeting_id", access.meeting.id)
    .eq("livekit_identity", body.identity);

  const { data: activeParticipants } = await admin
    .from("rt_meeting_participants")
    .select("id")
    .eq("meeting_id", access.meeting.id)
    .in("status", ["joining", "active"])
    .returns<ActiveParticipant[]>();

  if ((activeParticipants ?? []).length === 0) {
    await admin.from("rt_meetings").update({ empty_since_at: now, updated_at: now }).eq("id", access.meeting.id);
  }

  await logOperationalEvent({
    supabase: admin,
    meetingId: access.meeting.id,
    roomName: access.meeting.livekit_room_name,
    featureArea: "livekit",
    eventType: "participant_left",
    message: "Participant left the LiveKit room.",
    metadata: { identity: body.identity },
  });
  await recordUsageSnapshot({
    supabase: admin,
    meetingId: access.meeting.id,
    reason: "participant_leave",
    metadata: { identity: body.identity },
  });

  return NextResponse.json({ ok: true });
}
