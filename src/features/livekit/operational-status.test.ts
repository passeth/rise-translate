import { describe, expect, it } from "vitest";
import { getOperationalStatusTone, resolveCaptionConnectionStatus, summarizeCaptionStatus, summarizeTranslationStatus } from "./operational-status";

describe("operational status helpers", () => {
  it("moves caption state through delayed, connected, reconnecting, and unavailable", () => {
    expect(
      resolveCaptionConnectionStatus({ fetchOk: true, previousStatus: "delayed", captionCount: 0 }),
    ).toBe("delayed");
    expect(
      resolveCaptionConnectionStatus({
        fetchOk: true,
        previousStatus: "delayed",
        captionCount: 1,
        newestCaptionAt: "2026-05-09T00:00:00.000Z",
        now: new Date("2026-05-09T00:00:10.000Z").getTime(),
      }),
    ).toBe("connected");
    expect(
      resolveCaptionConnectionStatus({ fetchOk: false, previousStatus: "connected", captionCount: 1 }),
    ).toBe("reconnecting");
    expect(
      resolveCaptionConnectionStatus({ fetchOk: false, previousStatus: "reconnecting", captionCount: 1 }),
    ).toBe("unavailable");
  });

  it("summarizes caption status from transcript recency", () => {
    const now = new Date("2026-05-09T10:00:00.000Z").getTime();

    expect(summarizeCaptionStatus([], { now })).toEqual({
      status: "waiting",
      message: "Waiting for speech transcripts.",
    });
    expect(
      summarizeCaptionStatus([{ started_at: "2026-05-09T09:59:50.000Z" }], { now }),
    ).toEqual({ status: "connected", message: "Captions are receiving transcript segments." });
    expect(
      summarizeCaptionStatus([{ started_at: "2026-05-09T09:59:00.000Z" }], { now }),
    ).toEqual({ status: "delayed", message: "No recent captions have arrived." });
  });

  it("maps user-facing state tones", () => {
    expect(getOperationalStatusTone("connected")).toBe("ok");
    expect(getOperationalStatusTone("reconnecting")).toBe("warn");
    expect(getOperationalStatusTone("failed")).toBe("danger");
    expect(getOperationalStatusTone("stopped")).toBe("muted");
  });

  it("summarizes translation status from the latest session per speaker/language lane", () => {
    const now = new Date("2026-05-09T10:00:00.000Z").getTime();

    expect(summarizeTranslationStatus([], { now })).toEqual({
      status: "stopped",
      message: "No active translation channels.",
    });

    expect(
      summarizeTranslationStatus(
        [
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "starting",
            updated_at: "2026-05-09T09:59:59.000Z",
          },
        ],
        { now },
      ),
    ).toEqual({ status: "starting", message: "Translation is starting." });

    expect(
      summarizeTranslationStatus(
        [
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "starting",
            updated_at: "2026-05-09T09:59:00.000Z",
          },
        ],
        { now },
      ),
    ).toEqual({ status: "delayed", message: "A translation channel is delayed." });

    expect(
      summarizeTranslationStatus(
        [
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "starting",
            updated_at: "2026-05-09T09:55:00.000Z",
          },
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "connected",
            updated_at: "2026-05-09T09:59:30.000Z",
          },
        ],
        { now },
      ),
    ).toEqual({ status: "connected", message: "Translation audio is connected." });

    expect(
      summarizeTranslationStatus(
        [
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "failed",
            updated_at: "2026-05-09T09:55:00.000Z",
          },
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "stopped",
            updated_at: "2026-05-09T09:59:30.000Z",
          },
        ],
        { now },
      ),
    ).toEqual({ status: "stopped", message: "No active translation channels." });
  });
  it("treats connected translation sessions with stale heartbeats as delayed", () => {
    const now = new Date("2026-05-09T10:00:00.000Z").getTime();

    expect(
      summarizeTranslationStatus(
        [
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "connected",
            updated_at: "2026-05-09T09:59:58.000Z",
            worker_heartbeat_at: "2026-05-09T09:59:45.000Z",
          },
        ],
        { now },
      ),
    ).toEqual({ status: "connected", message: "Translation audio is connected." });

    expect(
      summarizeTranslationStatus(
        [
          {
            source_identity: "guest-1",
            target_language: "ko",
            status: "connected",
            updated_at: "2026-05-09T09:59:58.000Z",
            worker_heartbeat_at: "2026-05-09T09:58:00.000Z",
          },
        ],
        { now },
      ),
    ).toEqual({ status: "delayed", message: "Translation channel heartbeat is delayed." });
  });

});
