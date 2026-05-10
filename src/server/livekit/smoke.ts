import { RoomServiceClient } from "livekit-server-sdk";
import { requireEnv } from "@/lib/env";

export type LiveKitSmokeClient = {
  listRooms(names?: string[]): Promise<unknown[]>;
};

export type LiveKitSmokeResult = {
  url: string;
  roomCount: number;
};

export async function smokeLiveKitCredentials(
  client: LiveKitSmokeClient = createLiveKitSmokeClient(),
): Promise<LiveKitSmokeResult> {
  const rooms = await client.listRooms();

  return {
    url: requireEnv("LIVEKIT_URL"),
    roomCount: rooms.length,
  };
}

export function createLiveKitSmokeClient(): LiveKitSmokeClient {
  return new RoomServiceClient(requireEnv("LIVEKIT_URL"), requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"), {
    requestTimeout: 5_000,
  });
}
