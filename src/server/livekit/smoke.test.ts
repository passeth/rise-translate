import { describe, expect, it, vi } from "vitest";
import { smokeLiveKitCredentials } from "@/server/livekit/smoke";

describe("smokeLiveKitCredentials", () => {
  it("lists rooms with the supplied LiveKit client", async () => {
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    const client = { listRooms: vi.fn().mockResolvedValue([{ name: "room-1" }, { name: "room-2" }]) };

    await expect(smokeLiveKitCredentials(client)).resolves.toEqual({
      url: "wss://example.livekit.cloud",
      roomCount: 2,
    });
    expect(client.listRooms).toHaveBeenCalledWith();

    vi.unstubAllEnvs();
  });
});
