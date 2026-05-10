import type { SupportedLanguageCode } from "@/lib/languages";

/**
 * Media-plane contract for the long-lived translation worker.
 *
 * Next.js route handlers own control-plane validation/state only. A separate worker
 * or LiveKit Agent implementation must own the long-lived media loop:
 * one LiveKit participant microphone track -> one OpenAI Realtime session -> one
 * LiveKit translation audio track.
 */
export type TranslationBridgeStartRequest = {
  sessionId: string;
  meetingId: string;
  livekitRoomName: string;
  sourceParticipantIdentity: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
  targetTrackName: string;
};

export type TranslationBridgeStatus =
  | { status: "starting" | "connected" | "reconnecting"; message?: string }
  | { status: "failed"; message: string }
  | { status: "stopped"; message?: string };

export interface TranslationBridge {
  start(request: TranslationBridgeStartRequest): Promise<TranslationBridgeStatus>;
  stop(sessionId: string): Promise<TranslationBridgeStatus>;
}

export class DryRunTranslationBridge implements TranslationBridge {
  async start(request: TranslationBridgeStartRequest): Promise<TranslationBridgeStatus> {
    return {
      status: "starting",
      message: `Dry-run bridge planned ${request.sourceLanguage} → ${request.targetLanguage} on ${request.targetTrackName}.`,
    };
  }

  async stop(): Promise<TranslationBridgeStatus> {
    return { status: "stopped", message: "Dry-run bridge stopped." };
  }
}
