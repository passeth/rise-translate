import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatReadinessNext, getReadinessNextItems } from "./readiness-next";
import * as supervisor from "./translation-worker-supervisor";

const readyChecklist = `# Live QA checklist

Date: 2026-05-09
Tester: QA
Environment URL: https://meet.example.com
Supabase project: project
LiveKit project/region: region

| Check | Expected evidence | Result | Notes |
| --- | --- | --- | --- |
| Verify | ok | ☑ Pass ☐ Fail | evidence |

## Readiness decision

- ☑ Ready for internal buyer pilot
- ☐ Not ready — blocker list below

Blockers:

1.
`;

describe("readiness next actions", () => {
  beforeEach(() => {
    vi.spyOn(supervisor, "readWorkerStatus").mockReturnValue({
      running: true,
      pid: 123,
      logFile: "/tmp/translation-worker.log",
    });
  });

  it("summarizes the current local external blockers without running provider smokes", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("TRANSLATION_WORKER_ADAPTER", "livekit-node");
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "livekit-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "livekit-secret");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    const items = getReadinessNextItems();

    expect(items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["public-app-url", "web-env", "recording-storage", "live-qa", "deployment-smoke"]),
    );
    expect(formatReadinessNext(items)).toContain("Set the public HTTPS app URL");

    vi.unstubAllEnvs();
  });

  it("points to the final readiness gate when no lightweight blockers are visible", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://meet.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("APP_ENCRYPTION_KEY_BASE64", "encryption");
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "livekit-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "livekit-secret");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-translate");
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "gpt-realtime-whisper");
    vi.stubEnv("INTERNAL_WORKER_TOKEN", "internal");
    vi.stubEnv("TRANSLATION_WORKER_ADAPTER", "livekit-node");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "storage-key");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "storage-secret");

    expect(getReadinessNextItems({ liveQaMarkdown: readyChecklist })).toEqual([
      expect.objectContaining({ id: "final-readiness" }),
    ]);

    vi.unstubAllEnvs();
  });

  it("names only the missing recording credentials when the bucket is already configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");

    const recordingItem = getReadinessNextItems().find((item) => item.id === "recording-storage");

    expect(recordingItem?.action).toContain("https://supabase.com/dashboard/project/example/storage/s3");
    expect(recordingItem?.action).toContain("LIVEKIT_RECORDING_S3_ACCESS_KEY");
    expect(recordingItem?.action).toContain("LIVEKIT_RECORDING_S3_SECRET_KEY");
    expect(recordingItem?.action).not.toContain("LIVEKIT_RECORDING_S3_BUCKET,");
    expect(recordingItem?.action).toContain("pnpm recording:storage:finalize");

    vi.unstubAllEnvs();
  });

  it("reminds operators to run deployed preflight after production env changes", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://meet.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");

    expect(getReadinessNextItems().map((item) => item.id)).toContain("deployed-preflight");

    vi.unstubAllEnvs();
  });

  it("asks operators to start the long-running worker when it is not active", () => {
    vi.mocked(supervisor.readWorkerStatus).mockReturnValue({
      running: false,
      logFile: "/tmp/translation-worker.log",
      reason: "missing-pid",
    });

    expect(getReadinessNextItems().map((item) => item.id)).toContain("translation-worker-status");
  });
});
