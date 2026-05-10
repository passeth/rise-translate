import { getTargetLanguages } from "@/features/translation/config";
import type { SupportedLanguageCode } from "@/lib/languages";
import {
  startTranslationRouterForParticipant,
  type StartTranslationRouterInput,
} from "@/server/translation/router";

export type StartAllTranslationTargetsInput = Omit<StartTranslationRouterInput, "targetLanguage"> & {
  targetLanguages?: SupportedLanguageCode[];
};

export async function startAllTranslationTargetsForParticipant(input: StartAllTranslationTargetsInput) {
  const targetLanguages = getTranslationTargetLanguages(input.sourceLanguage, input.targetLanguages);
  const sessions = [];

  for (const targetLanguage of targetLanguages) {
    sessions.push(
      await startTranslationRouterForParticipant({
        ...input,
        targetLanguage,
      }),
    );
  }

  return {
    sourceLanguage: input.sourceLanguage,
    sessionCount: sessions.length,
    sessions,
  };
}

export function getExpectedTranslationTargetLanguages(sourceLanguage: SupportedLanguageCode) {
  return getTargetLanguages(sourceLanguage);
}

export function getTranslationTargetLanguages(
  sourceLanguage: SupportedLanguageCode,
  requestedTargetLanguages?: SupportedLanguageCode[],
) {
  const targetLanguages = requestedTargetLanguages === undefined
    ? getTargetLanguages(sourceLanguage)
    : requestedTargetLanguages;

  return [...new Set(targetLanguages)].filter((language) => language !== sourceLanguage);
}

export type ListenerLanguagePreference = {
  participantId: string;
  listeningLanguage: SupportedLanguageCode | null;
};

export function getNeededTranslationTargetLanguagesForListeners({
  sourceParticipantId,
  sourceLanguage,
  listeners,
}: {
  sourceParticipantId: string;
  sourceLanguage: SupportedLanguageCode;
  listeners: ListenerLanguagePreference[];
}) {
  return getTranslationTargetLanguages(
    sourceLanguage,
    listeners
      .filter((listener) => listener.participantId !== sourceParticipantId)
      .map((listener) => listener.listeningLanguage)
      .filter((language): language is SupportedLanguageCode => Boolean(language)),
  );
}
