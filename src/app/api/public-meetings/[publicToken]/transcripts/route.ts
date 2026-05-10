import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupportedLanguage } from "@/lib/languages";
import { resolvePublicMeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { resolveStoredKoreanText } from "@/server/transcripts/persistence";
import { validatePublicTranscriptWrite } from "@/server/transcripts/public-policy";
import { PUBLIC_TRANSCRIPT_TEXT_MAX_LENGTH } from "@/server/public-input-limits";
import {
  getPublicWriteRateLimitCutoff,
  isPublicWriteRateLimited,
  PUBLIC_TRANSCRIPT_RATE_LIMIT,
} from "@/server/public-write-rate-limit";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ publicToken: string }>;
};

type SourceParticipantRow = {
  id: string;
  speaking_language: string | null;
  status: string;
};

type ListenerParticipantRow = {
  id: string;
  listening_language: string | null;
  status: string;
};

const transcriptSchema = z.object({
  sourceIdentity: z.string().min(1),
  sourceLanguage: z.string().refine(isSupportedLanguage, "Unsupported source language."),
  targetLanguage: z.string().refine(isSupportedLanguage, "Unsupported target language."),
  sourceText: z.string().trim().min(1).max(PUBLIC_TRANSCRIPT_TEXT_MAX_LENGTH),
  translatedText: z.string().trim().min(1).max(PUBLIC_TRANSCRIPT_TEXT_MAX_LENGTH).optional(),
  startedAt: z.string().datetime().optional(),
  isFinal: z.boolean().default(false),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { publicToken } = await context.params;
  const access = await resolvePublicMeetingActor(publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const parsed = transcriptSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid transcript" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: speaker }, { data: listener }] = await Promise.all([
    admin
      .from("rt_meeting_participants")
      .select("id, speaking_language, status")
      .eq("meeting_id", access.meeting.id)
      .eq("livekit_identity", parsed.data.sourceIdentity)
      .maybeSingle<SourceParticipantRow>(),
    getListenerParticipant(admin, access),
  ]);

  const policy = validatePublicTranscriptWrite({
    source: speaker ?? null,
    listener: listener ?? null,
    sourceLanguage: parsed.data.sourceLanguage,
    targetLanguage: parsed.data.targetLanguage,
  });

  if (!policy.ok) {
    return NextResponse.json({ ok: true, persisted: false, reason: policy.reason }, { status: policy.status });
  }

  let koreanText: string;
  try {
    koreanText = resolveStoredKoreanText({
      sourceLanguage: parsed.data.sourceLanguage,
      sourceText: parsed.data.sourceText,
      koreanText: parsed.data.targetLanguage === "ko" ? parsed.data.translatedText : undefined,
    });
  } catch {
    return NextResponse.json({ ok: true, persisted: false, reason: "korean_translation_unavailable" });
  }

  const { count: recentTranscriptCount, error: rateError } = await admin
    .from("rt_transcript_segments")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", access.meeting.id)
    .eq("speaker_participant_id", policy.sourceParticipantId)
    .gte("created_at", getPublicWriteRateLimitCutoff({ windowMs: PUBLIC_TRANSCRIPT_RATE_LIMIT.windowMs }));

  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: 500 });
  }

  if (isPublicWriteRateLimited({ count: recentTranscriptCount, maxWrites: PUBLIC_TRANSCRIPT_RATE_LIMIT.maxWrites })) {
    return NextResponse.json({ ok: true, persisted: false, reason: "transcript_rate_limited" }, { status: 429 });
  }

  const startedAt = parsed.data.startedAt ?? new Date().toISOString();
  const sequence = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const { error } = await admin.from("rt_transcript_segments").insert({
    meeting_id: access.meeting.id,
    speaker_participant_id: policy.sourceParticipantId,
    sequence,
    started_at: startedAt,
    source_language: parsed.data.sourceLanguage,
    source_text: parsed.data.sourceText,
    korean_text: koreanText,
    is_final: parsed.data.isFinal,
    metadata: {
      clientCaptured: true,
      targetLanguage: parsed.data.targetLanguage,
      listenerParticipantId: policy.listenerParticipantId,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
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
    ? query.eq("host_user_id", access.actor.userId).maybeSingle<ListenerParticipantRow>()
    : query.eq("guest_session_id", access.actor.guestSessionId).maybeSingle<ListenerParticipantRow>();
}
