import type { SupportedLanguageCode } from "@/lib/languages";

export type TranslationStatusSourceParticipant = {
  id: string;
  speaking_language: string | null;
  status: string;
};

export type TranslationStatusListenerParticipant = {
  id: string;
  listening_language: string | null;
  status: string;
};

export type PublicTranslationStatusPolicyInput = {
  source: TranslationStatusSourceParticipant | null;
  listener: TranslationStatusListenerParticipant | null;
  targetLanguage: SupportedLanguageCode;
};

export type PublicTranslationStatusPolicyResult =
  | { ok: true; sourceParticipantId: string; listenerParticipantId: string; sourceLanguage: SupportedLanguageCode }
  | { ok: false; reason: string; status: number; ignore?: boolean };

const ACTIVE_PARTICIPANT_STATUSES = new Set(["joining", "active"]);
const SUPPORTED_STATUS_LANGUAGES = new Set(["ko", "en", "zh", "ja", "ru", "vi"]);

export function validatePublicTranslationStatusWrite({
  source,
  listener,
  targetLanguage,
}: PublicTranslationStatusPolicyInput): PublicTranslationStatusPolicyResult {
  if (!source) {
    return { ok: false, reason: "source_participant_not_found", status: 404 };
  }

  if (!ACTIVE_PARTICIPANT_STATUSES.has(source.status)) {
    return { ok: false, reason: "source_participant_not_active", status: 409 };
  }

  if (!source.speaking_language || !SUPPORTED_STATUS_LANGUAGES.has(source.speaking_language)) {
    return { ok: false, reason: "source_language_unavailable", status: 409 };
  }

  if (source.speaking_language === targetLanguage) {
    return { ok: false, reason: "same_language_translation_not_required", status: 200, ignore: true };
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

  return {
    ok: true,
    sourceParticipantId: source.id,
    listenerParticipantId: listener.id,
    sourceLanguage: source.speaking_language as SupportedLanguageCode,
  };
}
