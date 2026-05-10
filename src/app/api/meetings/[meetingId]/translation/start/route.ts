import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupportedLanguage } from "@/lib/languages";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { logOperationalEvent, getOperationalErrorMessage, toOperationalErrorType } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { publishTranslationStatus } from "@/server/translation/livekit-status";
import { TranslationWorkerNotReadyError } from "@/server/translation/readiness";
import { startTranslationRouterForParticipant } from "@/server/translation/router";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

type MeetingRow = {
  id: string;
  host_id: string;
  livekit_room_name: string;
  lifecycle_status: string;
};

type ParticipantRow = {
  id: string;
  livekit_identity: string;
  speaking_language: string | null;
  status: string;
};

const startSchema = z.object({
  sourceParticipantId: z.string().uuid(),
  targetLanguage: z.string().refine(isSupportedLanguage, "Unsupported target language."),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { meetingId } = await context.params;
  const parsed = startSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

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
    .select("id, host_id, livekit_room_name, lifecycle_status")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();

  if (!meeting || meeting.host_id !== user.id) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.lifecycle_status === "ended") {
    return NextResponse.json({ error: "Meeting has ended" }, { status: 409 });
  }

  const { data: participant } = await admin
    .from("rt_meeting_participants")
    .select("id, livekit_identity, speaking_language, status")
    .eq("id", parsed.data.sourceParticipantId)
    .eq("meeting_id", meeting.id)
    .in("status", ["joining", "active"])
    .maybeSingle<ParticipantRow>();

  if (!participant || !participant.speaking_language || !isSupportedLanguage(participant.speaking_language)) {
    return NextResponse.json({ error: "Participant with speaking language is required" }, { status: 404 });
  }

  if (participant.speaking_language === parsed.data.targetLanguage) {
    return NextResponse.json({ error: "Target language must differ from source language" }, { status: 400 });
  }

  try {
    const result = await startTranslationRouterForParticipant({
      meetingId: meeting.id,
      livekitRoomName: meeting.livekit_room_name,
      sourceParticipantId: participant.id,
      sourceIdentity: participant.livekit_identity,
      sourceLanguage: participant.speaking_language,
      targetLanguage: parsed.data.targetLanguage,
    });

    await publishTranslationStatus(meeting.livekit_room_name, {
      type: "translation_status",
      meetingId: meeting.id,
      status: "starting",
      message: `Translation router session is starting for ${participant.speaking_language} → ${parsed.data.targetLanguage}.`,
      sourceIdentity: participant.livekit_identity,
      targetLanguage: parsed.data.targetLanguage,
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "translation",
      eventType: "translation_start_requested",
      message: "Translation channel start was requested.",
      metadata: { sourceIdentity: participant.livekit_identity, targetLanguage: parsed.data.targetLanguage },
    });
    await recordUsageSnapshot({
      supabase: admin,
      meetingId: meeting.id,
      reason: "translation_start",
      metadata: { targetLanguage: parsed.data.targetLanguage },
    });

    return NextResponse.json(result);
  } catch (error) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "translation",
      eventType: "translation_start_failed",
      severity: "error",
      errorType: toOperationalErrorType(error),
      message: getOperationalErrorMessage(error, "Unable to start translation."),
      metadata: { sourceParticipantId: participant.id, targetLanguage: parsed.data.targetLanguage },
    });
    if (error instanceof TranslationWorkerNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to start translation" }, { status: 500 });
  }
}
