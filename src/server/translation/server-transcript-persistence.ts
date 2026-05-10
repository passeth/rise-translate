import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { ServerTranscriptSegment } from "@/server/translation/server-transcript-buffer";
import type { TranslationBridgeStartRequest } from "@/server/translation/bridge";

type SpeakerRow = { id: string };

export async function persistServerTranscriptSegment({
  request,
  segment,
  sequence = Date.now() * 1000 + Math.floor(Math.random() * 1000),
  startedAt = new Date().toISOString(),
}: {
  request: TranslationBridgeStartRequest;
  segment: ServerTranscriptSegment;
  sequence?: number;
  startedAt?: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: speaker } = await admin
    .from("rt_meeting_participants")
    .select("id")
    .eq("meeting_id", request.meetingId)
    .eq("livekit_identity", request.sourceParticipantIdentity)
    .maybeSingle<SpeakerRow>();

  const { error } = await admin.from("rt_transcript_segments").insert({
    meeting_id: request.meetingId,
    speaker_participant_id: speaker?.id ?? null,
    sequence,
    started_at: startedAt,
    source_language: request.sourceLanguage,
    source_text: segment.sourceText,
    korean_text: segment.koreanText,
    is_final: false,
    metadata: {
      serverCaptured: true,
      targetLanguage: request.targetLanguage,
      translationSessionId: request.sessionId,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}
