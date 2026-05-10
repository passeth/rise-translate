import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupportedLanguage } from "@/lib/languages";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import {
  getNeededTranslationTargetLanguagesForListeners,
  startAllTranslationTargetsForParticipant,
} from "@/server/translation/channel-orchestrator";
import { logOperationalEvent, getOperationalErrorMessage, toOperationalErrorType } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { publishTranslationStatus } from "@/server/translation/livekit-status";
import { TranslationWorkerNotReadyError } from "@/server/translation/readiness";

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

type ListenerLanguageRow = {
  id: string;
  listening_language: string | null;
};

const startAllSchema = z.object({
  sourceParticipantId: z.string().uuid(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { meetingId } = await context.params;
  const parsed = startAllSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: "sourceParticipantId is required" }, { status: 400 });
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

  const [{ data: participant }, { data: listenerRows }] = await Promise.all([
    admin
      .from("rt_meeting_participants")
      .select("id, livekit_identity, speaking_language, status")
      .eq("id", parsed.data.sourceParticipantId)
      .eq("meeting_id", meeting.id)
      .in("status", ["joining", "active"])
      .maybeSingle<ParticipantRow>(),
    admin
      .from("rt_meeting_participants")
      .select("id, listening_language")
      .eq("meeting_id", meeting.id)
      .in("status", ["joining", "active"])
      .returns<ListenerLanguageRow[]>(),
  ]);

  if (!participant || !participant.speaking_language || !isSupportedLanguage(participant.speaking_language)) {
    return NextResponse.json({ error: "Participant with speaking language is required" }, { status: 404 });
  }

  const neededTargetLanguages = getNeededTranslationTargetLanguagesForListeners({
    sourceParticipantId: participant.id,
    sourceLanguage: participant.speaking_language,
    listeners: (listenerRows ?? []).map((listener) => ({
      participantId: listener.id,
      listeningLanguage: listener.listening_language && isSupportedLanguage(listener.listening_language)
        ? listener.listening_language
        : null,
    })),
  });

  try {
    const result = await startAllTranslationTargetsForParticipant({
      meetingId: meeting.id,
      livekitRoomName: meeting.livekit_room_name,
      sourceParticipantId: participant.id,
      sourceIdentity: participant.livekit_identity,
      sourceLanguage: participant.speaking_language,
      targetLanguages: neededTargetLanguages,
    });

    const hasStartedSessions = result.sessionCount > 0;

    await publishTranslationStatus(meeting.livekit_room_name, {
      type: "translation_status",
      meetingId: meeting.id,
      status: hasStartedSessions ? "starting" : "idle",
      message: hasStartedSessions
        ? `Translation router sessions are starting for ${participant.speaking_language} → ${neededTargetLanguages.join(", ")}.`
        : `No server translation channels are needed for ${participant.speaking_language}; active listeners already use the source language.`,
      sourceIdentity: participant.livekit_identity,
      occurredAt: new Date().toISOString(),
    }).catch(() => undefined);
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "translation",
      eventType: hasStartedSessions ? "translation_start_all_requested" : "translation_start_all_skipped",
      message: hasStartedSessions
        ? "Needed target translation channels were requested for a participant."
        : "Server translation start was skipped because no listener needs a translated target language.",
      metadata: {
        sourceIdentity: participant.livekit_identity,
        sessionCount: result.sessionCount,
        targetLanguages: neededTargetLanguages,
      },
    });

    if (hasStartedSessions) {
      await recordUsageSnapshot({
        supabase: admin,
        meetingId: meeting.id,
        reason: "translation_start",
        metadata: { sessionCount: result.sessionCount },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "translation",
      eventType: "translation_start_all_failed",
      severity: "error",
      errorType: toOperationalErrorType(error),
      message: getOperationalErrorMessage(error, "Unable to start translation channels."),
      metadata: { sourceParticipantId: participant.id },
    });
    if (error instanceof TranslationWorkerNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to start translation channels" }, { status: 500 });
  }
}
