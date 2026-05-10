import { describe, expect, it } from "vitest";
import {
  buildRecordingStorageEnvPatch,
  fingerprint,
  getRecordingStorageCredentialsFromEnv,
  upsertDotenvValues,
} from "./recording-storage-configure";

describe("recording storage configure helpers", () => {
  it("reads supported credential env names without requiring secrets in argv", () => {
    expect(
      getRecordingStorageCredentialsFromEnv({
        SUPABASE_S3_ACCESS_KEY_ID: "access",
        SUPABASE_S3_SECRET_ACCESS_KEY: "secret",
        SUPABASE_S3_REGION: "ap-northeast-2",
      }),
    ).toEqual({ accessKey: "access", secretKey: "secret", region: "ap-northeast-2", endpoint: undefined });
  });

  it("returns null until both access key and secret key are present", () => {
    expect(getRecordingStorageCredentialsFromEnv({ LIVEKIT_RECORDING_S3_ACCESS_KEY: "access" })).toBeNull();
  });

  it("upserts recording env values while preserving unrelated settings", () => {
    const next = upsertDotenvValues(
      "NEXT_PUBLIC_APP_URL=https://meet.example.com\nLIVEKIT_RECORDING_S3_BUCKET=old\n",
      buildRecordingStorageEnvPatch({ accessKey: "access", secretKey: "secret" }),
    );

    expect(next).toContain("NEXT_PUBLIC_APP_URL=https://meet.example.com");
    expect(next).toContain("LIVEKIT_RECORDING_S3_BUCKET=recordings");
    expect(next).toContain("LIVEKIT_RECORDING_S3_ACCESS_KEY=access");
    expect(next).toContain("LIVEKIT_RECORDING_S3_SECRET_KEY=secret");
    expect(next).toContain("LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE=true");
  });

  it("prints stable fingerprints instead of secret values", () => {
    expect(fingerprint("secret")).toHaveLength(12);
    expect(fingerprint("secret")).toBe(fingerprint("secret"));
  });
});
