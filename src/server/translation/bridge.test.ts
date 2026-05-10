import { describe, expect, it } from "vitest";
import { DryRunTranslationBridge } from "./bridge";

describe("translation bridge contract", () => {
  it("dry-runs a single source-to-target lane", async () => {
    const bridge = new DryRunTranslationBridge();

    await expect(
      bridge.start({
        sessionId: "session-1",
        meetingId: "meeting-1",
        livekitRoomName: "lk_room",
        sourceParticipantIdentity: "guest_1",
        sourceLanguage: "ja",
        targetLanguage: "ko",
        targetTrackName: "translation-ko",
      }),
    ).resolves.toMatchObject({
      status: "starting",
      message: expect.stringContaining("ja → ko"),
    });
  });
});
