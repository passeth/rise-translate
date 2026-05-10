import type { SupportedLanguageCode } from "@/lib/languages";
import { isRoomParticipantPresent } from "@/server/livekit/room-control";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { TranslationSessionRecord } from "@/server/translation/session-repository";

type MeetingRow = {
  lifecycle_status: string;
};

type ParticipantRow = {
  status: string;
  speaking_language: SupportedLanguageCode | null;
};

export type TranslationSessionPreflightResult =
  | { ok: true }
  | { ok: false; message: string; reason: "meeting_unavailable" | "participant_unavailable" | "language_mismatch" };

export async function validateTranslationSessionPreflight(
  session: TranslationSessionRecord,
  {
    liveKitParticipantPresent = isRoomParticipantPresent,
  }: {
    liveKitParticipantPresent?: (roomName: string, identity: string) => Promise<boolean>;
  } = {},
): Promise<TranslationSessionPreflightResult> {
  const admin = createSupabaseAdminClient();
  const [{ data: meeting }, { data: participant }] = await Promise.all([
    admin
      .from("rt_meetings")
      .select("lifecycle_status")
      .eq("id", session.meetingId)
      .maybeSingle<MeetingRow>(),
    admin
      .from("rt_meeting_participants")
      .select("status, speaking_language")
      .eq("meeting_id", session.meetingId)
      .eq("livekit_identity", session.sourceParticipantIdentity)
      .maybeSingle<ParticipantRow>(),
  ]);

  const databasePreflight = evaluateTranslationSessionPreflight({
    meeting: meeting ?? null,
    participant: participant ?? null,
    sourceLanguage: session.sourceLanguage,
    sourceIdentity: session.sourceParticipantIdentity,
  });

  if (!databasePreflight.ok) {
    return databasePreflight;
  }

  const participantPresent = await liveKitParticipantPresent(session.livekitRoomName, session.sourceParticipantIdentity).catch(() => false);
  if (!participantPresent) {
    return {
      ok: false,
      reason: "participant_unavailable",
      message: `Translation session was skipped because source participant ${session.sourceParticipantIdentity} is not connected to the LiveKit room.`,
    };
  }

  return { ok: true };
}

export function evaluateTranslationSessionPreflight({
  meeting,
  participant,
  sourceLanguage,
  sourceIdentity,
}: {
  meeting: MeetingRow | null;
  participant: ParticipantRow | null;
  sourceLanguage: SupportedLanguageCode;
  sourceIdentity: string;
}): TranslationSessionPreflightResult {
  if (!meeting || meeting.lifecycle_status === "ended") {
    return {
      ok: false,
      reason: "meeting_unavailable",
      message: "Translation session was skipped because the meeting is unavailable or ended.",
    };
  }

  if (!participant || !["joining", "active"].includes(participant.status)) {
    return {
      ok: false,
      reason: "participant_unavailable",
      message: `Translation session was skipped because source participant ${sourceIdentity} is no longer active.`,
    };
  }

  if (participant.speaking_language && participant.speaking_language !== sourceLanguage) {
    return {
      ok: false,
      reason: "language_mismatch",
      message: `Translation session was skipped because source participant language changed from ${sourceLanguage} to ${participant.speaking_language}.`,
    };
  }

  return { ok: true };
}
