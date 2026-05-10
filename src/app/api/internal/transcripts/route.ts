import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupportedLanguage } from "@/lib/languages";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { resolveStoredKoreanText } from "@/server/transcripts/persistence";
import { isInternalWorkerAuthorized } from "@/server/operations/internal-auth";

export const dynamic = "force-dynamic";

const transcriptSchema = z.object({
  meetingId: z.string().uuid(),
  speakerParticipantId: z.string().uuid().optional(),
  sequence: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  sourceLanguage: z.string().refine(isSupportedLanguage, "Unsupported source language."),
  sourceText: z.string().trim().min(1),
  koreanText: z.string().optional(),
  isFinal: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  if (!isInternalWorkerAuthorized({
    authorizationHeader: request.headers.get("authorization"),
    expectedToken: process.env.INTERNAL_WORKER_TOKEN,
  })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = transcriptSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid transcript" }, { status: 400 });
  }

  const koreanText = resolveStoredKoreanText({
    sourceLanguage: parsed.data.sourceLanguage,
    sourceText: parsed.data.sourceText,
    koreanText: parsed.data.koreanText,
  });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("rt_transcript_segments").insert({
    meeting_id: parsed.data.meetingId,
    speaker_participant_id: parsed.data.speakerParticipantId ?? null,
    sequence: parsed.data.sequence,
    started_at: parsed.data.startedAt,
    ended_at: parsed.data.endedAt ?? null,
    source_language: parsed.data.sourceLanguage,
    source_text: parsed.data.sourceText,
    korean_text: koreanText,
    is_final: parsed.data.isFinal,
    metadata: parsed.data.metadata,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
