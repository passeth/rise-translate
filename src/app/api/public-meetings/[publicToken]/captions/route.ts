import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createCaptionEvent } from "@/features/captions/caption-events";
import { isSupportedLanguage } from "@/lib/languages";
import { resolvePublicMeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { logOperationalEvent } from "@/server/observability/events";

type RouteContext = {
  params: Promise<{ publicToken: string }>;
};

type TranscriptRow = {
  id: string;
  started_at: string;
  source_language: string;
  source_text: string;
  korean_text: string;
  is_final: boolean;
  metadata: Record<string, unknown> | null;
  rt_meeting_participants: {
    display_name: string;
    company: string;
  } | null;
};

const querySchema = z.object({
  listeningLanguage: z.string().refine(isSupportedLanguage).default("ko"),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const { publicToken } = await context.params;
  const access = await resolvePublicMeetingActor(publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const query = querySchema.parse({
    listeningLanguage: request.nextUrl.searchParams.get("listeningLanguage") ?? "ko",
  });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("rt_transcript_segments")
    .select("id, started_at, source_language, source_text, korean_text, is_final, metadata, rt_meeting_participants(display_name, company)")
    .eq("meeting_id", access.meeting.id)
    .order("started_at", { ascending: true })
    .limit(100)
    .returns<TranscriptRow[]>();

  if (error) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: access.meeting.id,
      roomName: access.meeting.livekit_room_name,
      featureArea: "captions",
      eventType: "captions_unavailable",
      severity: "error",
      errorType: "supabase_error",
      message: error.message,
      metadata: { listeningLanguage: query.listeningLanguage },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const captions = (data ?? []).map((segment) => {
    const metadata = segment.metadata ?? {};
    const metadataTargetLanguage = metadata.targetLanguage;
    const metadataTranslatedText = metadata.translatedText;
    const translatedText =
      query.listeningLanguage === "ko"
        ? segment.korean_text
        : metadataTargetLanguage === query.listeningLanguage && typeof metadataTranslatedText === "string"
          ? metadataTranslatedText
          : segment.source_text;

    return createCaptionEvent({
      id: segment.id,
      speakerName: segment.rt_meeting_participants?.display_name ?? "Unknown",
      speakerCompany: segment.rt_meeting_participants?.company ?? "",
      sourceLanguage: isSupportedLanguage(segment.source_language) ? segment.source_language : "ko",
      targetLanguage: query.listeningLanguage,
      sourceText: segment.source_text,
      translatedText,
      startedAt: segment.started_at,
      isFinal: segment.is_final,
      status: "connected",
    });
  });

  return NextResponse.json({ captions });
}
