import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { logOperationalEvent, getOperationalErrorMessage, toOperationalErrorType } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { publishTranslationStatus } from "@/server/translation/livekit-status";
import { stopTranslationRouterForMeeting } from "@/server/translation/router";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

type MeetingRow = {
  id: string;
  host_id: string;
  livekit_room_name: string;
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
    .select("id, host_id, livekit_room_name")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();

  if (!meeting || meeting.host_id !== user.id) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  try {
    await stopTranslationRouterForMeeting(meeting.id);
    await publishTranslationStatus(meeting.livekit_room_name, {
      type: "translation_status",
      meetingId: meeting.id,
      status: "stopped",
      message: "Translation router sessions stopped.",
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "cleanup",
      eventType: "translation_shutdown",
      message: "Translation sessions stopped by host request.",
    });
    await recordUsageSnapshot({ supabase: admin, meetingId: meeting.id, reason: "translation_stop" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "translation",
      eventType: "translation_stop_failed",
      severity: "error",
      errorType: toOperationalErrorType(error),
      message: getOperationalErrorMessage(error, "Unable to stop translation."),
    });
    return NextResponse.json({ error: "Unable to stop translation" }, { status: 500 });
  }
}
