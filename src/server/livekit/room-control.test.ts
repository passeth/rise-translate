import { describe, expect, it, vi } from "vitest";
import { disconnectRoomParticipants, isRoomParticipantPresent, type LiveKitRoomControlClient } from "./room-control";

describe("disconnectRoomParticipants", () => {
  it("removes all participants with identities", async () => {
    const client: LiveKitRoomControlClient = {
      listParticipants: vi.fn().mockResolvedValue([{ identity: "host" }, { identity: "guest" }, {}]),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
    };

    await expect(disconnectRoomParticipants("room-1", client)).resolves.toEqual({
      attempted: 2,
      removed: 2,
      failed: [],
    });
    expect(client.removeParticipant).toHaveBeenCalledWith("room-1", "host");
    expect(client.removeParticipant).toHaveBeenCalledWith("room-1", "guest");
  });

  it("keeps removing other participants when one removal fails", async () => {
    const client: LiveKitRoomControlClient = {
      listParticipants: vi.fn().mockResolvedValue([{ identity: "host" }, { identity: "guest" }]),
      removeParticipant: vi.fn().mockImplementation(async (_room, identity) => {
        if (identity === "guest") throw new Error("already gone");
      }),
    };

    await expect(disconnectRoomParticipants("room-1", client)).resolves.toEqual({
      attempted: 2,
      removed: 1,
      failed: [{ identity: "guest", message: "already gone" }],
    });
  });

  it("checks whether a participant identity is present in a room", async () => {
    const client: LiveKitRoomControlClient = {
      listParticipants: vi.fn().mockResolvedValue([{ identity: "host" }, { identity: "guest" }]),
      removeParticipant: vi.fn(),
    };

    await expect(isRoomParticipantPresent("room-1", "guest", client)).resolves.toBe(true);
    await expect(isRoomParticipantPresent("room-1", "missing", client)).resolves.toBe(false);
  });
});
