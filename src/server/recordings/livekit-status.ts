import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
import { requireEnv } from "@/lib/env";
import type { RecordingStatusEvent } from "@/features/recordings/status";

export async function publishRecordingStatus(roomName: string, event: RecordingStatusEvent) {
  const roomService = new RoomServiceClient(
    requireEnv("LIVEKIT_URL"),
    requireEnv("LIVEKIT_API_KEY"),
    requireEnv("LIVEKIT_API_SECRET"),
  );
  const payload = new TextEncoder().encode(JSON.stringify(event));

  await roomService.sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
    topic: "recording-status",
  });
}
