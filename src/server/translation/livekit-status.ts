import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
import { requireEnv } from "@/lib/env";

export type TranslationStatusEvent = {
  type: "translation_status";
  meetingId: string;
  status: "idle" | "starting" | "connected" | "reconnecting" | "failed" | "stopped";
  message?: string;
  sourceIdentity?: string;
  targetLanguage?: string;
  occurredAt: string;
};

export async function publishTranslationStatus(roomName: string, event: TranslationStatusEvent) {
  const roomService = new RoomServiceClient(
    requireEnv("LIVEKIT_URL"),
    requireEnv("LIVEKIT_API_KEY"),
    requireEnv("LIVEKIT_API_SECRET"),
  );
  const payload = new TextEncoder().encode(JSON.stringify(event));

  await roomService.sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
    topic: "translation-status",
  });
}
