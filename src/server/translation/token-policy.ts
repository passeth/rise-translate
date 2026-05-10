import { isSupportedLanguage, type SupportedLanguageCode } from "@/lib/languages";

export type TranslationTokenSourceParticipant = {
  livekit_identity: string;
  speaking_language: string | null;
  status: string;
};

export type TranslationTokenListenerParticipant = {
  livekit_identity: string;
  listening_language: string | null;
  status: string;
};

export class TranslationTokenPolicyError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TranslationTokenPolicyError";
    this.status = status;
  }
}

export function validateTranslationTokenRequest({
  sourceParticipant,
  listenerParticipant,
  requestedSourceLanguage,
  targetLanguage,
}: {
  sourceParticipant: TranslationTokenSourceParticipant | null;
  listenerParticipant: TranslationTokenListenerParticipant | null;
  requestedSourceLanguage?: string;
  targetLanguage: SupportedLanguageCode;
}) {
  if (!sourceParticipant) {
    throw new TranslationTokenPolicyError("Source participant is not active in this meeting.", 404);
  }

  if (!sourceParticipant.status || !["joining", "active"].includes(sourceParticipant.status)) {
    throw new TranslationTokenPolicyError("Source participant is not active in this meeting.", 409);
  }

  if (!listenerParticipant) {
    throw new TranslationTokenPolicyError("Listening participant is not active in this meeting.", 404);
  }

  if (!listenerParticipant.status || !["joining", "active"].includes(listenerParticipant.status)) {
    throw new TranslationTokenPolicyError("Listening participant is not active in this meeting.", 409);
  }

  if (sourceParticipant.livekit_identity === listenerParticipant.livekit_identity) {
    throw new TranslationTokenPolicyError("Participants do not need translation for their own microphone.", 400);
  }

  const persistedSourceLanguage = sourceParticipant.speaking_language;
  if (!persistedSourceLanguage || !isSupportedLanguage(persistedSourceLanguage)) {
    throw new TranslationTokenPolicyError("Source participant speaking language is unavailable.", 409);
  }

  const persistedListeningLanguage = listenerParticipant.listening_language;
  if (!persistedListeningLanguage || !isSupportedLanguage(persistedListeningLanguage)) {
    throw new TranslationTokenPolicyError("Listening participant language is unavailable.", 409);
  }

  if (requestedSourceLanguage && requestedSourceLanguage !== persistedSourceLanguage) {
    throw new TranslationTokenPolicyError("Source language does not match participant metadata.", 409);
  }

  if (persistedListeningLanguage !== targetLanguage) {
    throw new TranslationTokenPolicyError("Target language does not match listener preference.", 409);
  }

  if (persistedSourceLanguage === targetLanguage) {
    throw new TranslationTokenPolicyError("Source and listening language are the same; translation is not required.", 400);
  }

  return {
    sourceLanguage: persistedSourceLanguage,
    targetLanguage,
  };
}
