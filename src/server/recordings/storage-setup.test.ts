import { describe, expect, it, vi } from "vitest";
import {
  buildRecordingStorageSetupGuide,
  deriveSupabaseProjectRef,
  formatRecordingStorageSetupGuide,
} from "./storage-setup";

describe("recording storage setup guide", () => {
  it("derives the project ref from Supabase API and direct storage URLs", () => {
    expect(deriveSupabaseProjectRef("https://ketyyrhkhfqecucsidfv.supabase.co")).toBe("ketyyrhkhfqecucsidfv");
    expect(deriveSupabaseProjectRef("https://ketyyrhkhfqecucsidfv.storage.supabase.co/storage/v1/s3")).toBe(
      "ketyyrhkhfqecucsidfv",
    );
  });

  it("prints the project-specific dashboard URL and missing recording env", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ketyyrhkhfqecucsidfv.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "");

    const guide = buildRecordingStorageSetupGuide();
    const output = formatRecordingStorageSetupGuide(guide);

    expect(guide.dashboardUrl).toBe("https://supabase.com/dashboard/project/ketyyrhkhfqecucsidfv/storage/s3");
    expect(guide.missingEnv).toEqual(["LIVEKIT_RECORDING_S3_ACCESS_KEY", "LIVEKIT_RECORDING_S3_SECRET_KEY"]);
    expect(output).toContain("Generate a new access key pair");
    expect(output).toContain("pnpm recording:storage:finalize");

    vi.unstubAllEnvs();
  });
});
