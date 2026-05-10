import type { SupportedLanguageCode } from "@/lib/languages";

export type TranscriptSourceParticipant = {
  id: string;
  speaking_language: string | null;
  status: string;
};

export type TranscriptListenerParticipant = {
  id: string;
  listening_language: string | null;
  status: string;
};

export type PublicTranscriptPolicyInput = {
  source: TranscriptSourceParticipant | null;
  listener: TranscriptListenerParticipant | null;
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
};

export type PublicTranscriptPolicyResult =
  | { ok: true; sourceParticipantId: string; listenerParticipantId: string }
  | { ok: false; reason: string; status: number };

const ACTIVE_PARTICIPANT_STATUSES = new Set(["joining", "active"]);

export function validatePublicTranscriptWrite({
  source,
  listener,
  sourceLanguage,
  targetLanguage,
}: PublicTranscriptPolicyInput): PublicTranscriptPolicyResult {
  if (!source) {
    return { ok: false, reason: "source_participant_not_found", status: 404 };
  }

  if (!ACTIVE_PARTICIPANT_STATUSES.has(source.status)) {
    return { ok: false, reason: "source_participant_not_active", status: 409 };
  }

  if (source.speaking_language !== sourceLanguage) {
    return { ok: false, reason: "source_language_mismatch", status: 409 };
  }

  if (!listener) {
    return { ok: false, reason: "listener_participant_not_found", status: 404 };
  }

  if (!ACTIVE_PARTICIPANT_STATUSES.has(listener.status)) {
    return { ok: false, reason: "listener_participant_not_active", status: 409 };
  }

  if (listener.listening_language !== targetLanguage) {
    return { ok: false, reason: "listener_language_mismatch", status: 409 };
  }

  return { ok: true, sourceParticipantId: source.id, listenerParticipantId: listener.id };
}
