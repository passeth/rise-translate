import { RoomServiceClient } from "livekit-server-sdk";
import { requireEnv } from "@/lib/env";

type LiveKitParticipant = {
  identity?: string;
};

export type LiveKitRoomControlClient = {
  listParticipants(roomName: string): Promise<LiveKitParticipant[]>;
  removeParticipant(roomName: string, identity: string): Promise<void>;
};

export type DisconnectRoomParticipantsResult = {
  attempted: number;
  removed: number;
  failed: Array<{ identity: string; message: string }>;
};

export async function disconnectRoomParticipants(
  roomName: string,
  client: LiveKitRoomControlClient = createRoomControlClient(),
): Promise<DisconnectRoomParticipantsResult> {
  const participants = await client.listParticipants(roomName);
  const identities = participants.map((participant) => participant.identity).filter((identity): identity is string => Boolean(identity));
  const failed: DisconnectRoomParticipantsResult["failed"] = [];
  let removed = 0;

  await Promise.all(
    identities.map(async (identity) => {
      try {
        await client.removeParticipant(roomName, identity);
        removed += 1;
      } catch (error) {
        failed.push({ identity, message: error instanceof Error ? error.message : "Unable to remove participant." });
      }
    }),
  );

  return { attempted: identities.length, removed, failed };
}

export async function isRoomParticipantPresent(
  roomName: string,
  identity: string,
  client: Pick<LiveKitRoomControlClient, "listParticipants"> = createRoomControlClient(),
) {
  const participants = await client.listParticipants(roomName);
  return participants.some((participant) => participant.identity === identity);
}

export function createRoomControlClient(): LiveKitRoomControlClient {
  return new RoomServiceClient(requireEnv("LIVEKIT_URL"), requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"));
}
