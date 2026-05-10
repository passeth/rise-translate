import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupportedLanguage } from "@/lib/languages";
import { getTranslationTrackName } from "@/features/translation/config";
import { getServerEnv } from "@/lib/env";
import { resolvePublicMeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { logOperationalEvent } from "@/server/observability/events";
import { validatePublicTranslationStatusWrite } from "@/server/translation/public-status-policy";
import { isTranslationLaneUniqueConflict } from "@/server/translation/router";
import { BROWSER_TRANSLATION_WORKER_ID } from "@/server/translation/session-ownership";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ publicToken: string }>;
};

type ParticipantRow = {
  id: string;
  speaking_language: string | null;
};

type StatusSourceParticipantRow = {
  id: string;
  speaking_language: string | null;
  status: string;
};

type StatusListenerParticipantRow = {
  id: string;
  listening_language: string | null;
  status: string;
};

type UpdatedSessionRow = {
  id: string;
};

const statusSchema = z.object({
  sourceIdentity: z.string().min(1),
  targetLanguage: z.string().refine(isSupportedLanguage, "Unsupported target language."),
  status: z.enum(["starting", "connected", "reconnecting", "failed", "stopped"]),
  message: z.string().max(1000).optional(),
  heartbeat: z.boolean().optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { publicToken } = await context.params;
  const access = await resolvePublicMeetingActor(publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const parsed = statusSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid translation status" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: sourceParticipant }, { data: listenerParticipant }] = await Promise.all([
    admin
      .from("rt_meeting_participants")
      .select("id, speaking_language, status")
      .eq("meeting_id", access.meeting.id)
      .eq("livekit_identity", parsed.data.sourceIdentity)
      .maybeSingle<StatusSourceParticipantRow>(),
    getListenerParticipant(admin, access),
  ]);
  const policy = validatePublicTranslationStatusWrite({
    source: sourceParticipant ?? null,
    listener: listenerParticipant ?? null,
    targetLanguage: parsed.data.targetLanguage,
  });

  if (!policy.ok) {
    return NextResponse.json({ ok: true, ignored: Boolean(policy.ignore), reason: policy.reason }, { status: policy.status });
  }

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {
    status: parsed.data.status,
    last_error: parsed.data.status === "failed" ? parsed.data.message ?? "Browser translation failed." : null,
    updated_at: now,
    worker_heartbeat_at: now,
  };

  if (parsed.data.status === "connected") {
    patch.connected_at = now;
  }

  if (parsed.data.status === "stopped") {
    patch.stopped_at = now;
  }

  const { data: updatedSessions, error } = await admin
    .from("rt_translation_sessions")
    .update(patch)
    .eq("meeting_id", access.meeting.id)
    .eq("source_identity", parsed.data.sourceIdentity)
    .eq("target_language", parsed.data.targetLanguage)
    .eq("worker_id", BROWSER_TRANSLATION_WORKER_ID)
    .in("status", ["starting", "connected", "reconnecting", "failed"])
    .select("id")
    .returns<UpdatedSessionRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ((updatedSessions ?? []).length === 0 && parsed.data.heartbeat) {
    return NextResponse.json({ ok: true });
  }

  if ((updatedSessions ?? []).length === 0 && parsed.data.status !== "stopped") {
    const ensured = await ensureBrowserTranslationSession({
      meetingId: access.meeting.id,
      roomName: access.meeting.livekit_room_name,
      sourceIdentity: parsed.data.sourceIdentity,
      targetLanguage: parsed.data.targetLanguage,
      status: parsed.data.status,
      message: parsed.data.message,
      now,
    });

    if (!ensured.ok) {
      return NextResponse.json({ error: ensured.error }, { status: 500 });
    }
  }

  if (!parsed.data.heartbeat) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: access.meeting.id,
      roomName: access.meeting.livekit_room_name,
      featureArea: "translation",
      eventType: "browser_translation_status",
      severity: parsed.data.status === "failed" ? "error" : "info",
      errorType: parsed.data.status === "failed" ? "browser_translation_error" : null,
      message: parsed.data.message,
      metadata: {
        sourceIdentity: parsed.data.sourceIdentity,
        targetLanguage: parsed.data.targetLanguage,
        status: parsed.data.status,
        actorType: access.actor.type,
        listenerParticipantId: policy.listenerParticipantId,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

async function ensureBrowserTranslationSession({
  meetingId,
  roomName,
  sourceIdentity,
  targetLanguage,
  status,
  message,
  now,
}: {
  meetingId: string;
  roomName: string;
  sourceIdentity: string;
  targetLanguage: string;
  status: "starting" | "connected" | "reconnecting" | "failed";
  message?: string;
  now: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: participant, error: participantError } = await admin
    .from("rt_meeting_participants")
    .select("id, speaking_language")
    .eq("meeting_id", meetingId)
    .eq("livekit_identity", sourceIdentity)
    .maybeSingle<ParticipantRow>();

  if (participantError) {
    return { ok: false as const, error: participantError.message };
  }

  if (!participant?.speaking_language || !isSupportedLanguage(participant.speaking_language)) {
    return { ok: false as const, error: "Source participant speaking language is unavailable." };
  }

  if (!isSupportedLanguage(targetLanguage)) {
    return { ok: false as const, error: "Unsupported target language." };
  }

  if (participant.speaking_language === targetLanguage) {
    return { ok: true as const };
  }

  const insertPatch: Record<string, string | null> = {
    meeting_id: meetingId,
    source_participant_id: participant.id,
    source_identity: sourceIdentity,
    source_language: participant.speaking_language,
    target_language: targetLanguage,
    target_track_name: getTranslationTrackName(targetLanguage),
    status,
    openai_model: getServerEnv().OPENAI_TRANSLATION_MODEL,
    livekit_room_name: roomName,
    worker_id: BROWSER_TRANSLATION_WORKER_ID,
    last_error: status === "failed" ? message ?? "Browser translation failed." : null,
    worker_heartbeat_at: now,
    updated_at: now,
  };

  if (status === "connected") {
    insertPatch.connected_at = now;
  }

  const { error } = await admin.from("rt_translation_sessions").insert(insertPatch);
  if (isTranslationLaneUniqueConflict(error)) {
    return { ok: true as const };
  }
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

function getListenerParticipant(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  access: NonNullable<Awaited<ReturnType<typeof resolvePublicMeetingActor>>>,
) {
  const query = admin
    .from("rt_meeting_participants")
    .select("id, listening_language, status")
    .eq("meeting_id", access.meeting.id)
    .in("status", ["joining", "active"])
    .order("joined_at", { ascending: false })
    .limit(1);

  return access.actor.type === "host"
    ? query.eq("host_user_id", access.actor.userId).maybeSingle<StatusListenerParticipantRow>()
    : query.eq("guest_session_id", access.actor.guestSessionId).maybeSingle<StatusListenerParticipantRow>();
}
