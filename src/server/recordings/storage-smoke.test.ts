import { describe, expect, it, vi } from "vitest";
import {
  buildRecordingStorageObjectUrl,
  createSmokeObjectKey,
  signS3Request,
  smokeRecordingStorage,
} from "@/server/recordings/storage-smoke";
import type { RecordingStorageConfig } from "@/server/recordings/livekit-egress";

const storage: RecordingStorageConfig = {
  bucket: "recordings",
  endpoint: "https://example.storage.supabase.co/storage/v1/s3",
  region: "auto",
  accessKey: "access-key",
  secret: "secret-key",
  forcePathStyle: true,
};

describe("recording storage smoke helpers", () => {
  it("builds Supabase path-style S3 object URLs without losing the endpoint path", () => {
    expect(buildRecordingStorageObjectUrl(storage, "smoke/a b.txt").toString()).toBe(
      "https://example.storage.supabase.co/storage/v1/s3/recordings/smoke/a%20b.txt",
    );
  });

  it("can build virtual-hosted S3 object URLs for non-Supabase providers", () => {
    expect(
      buildRecordingStorageObjectUrl(
        { ...storage, endpoint: "https://s3.example.com", forcePathStyle: false },
        "meetings/m1/r1.mp4",
      ).toString(),
    ).toBe("https://recordings.s3.example.com/meetings/m1/r1.mp4");
  });

  it("creates deterministic smoke object keys", () => {
    expect(createSmokeObjectKey(new Date("2026-05-09T12:34:56.789Z"))).toBe(
      "smoke/recording-storage-2026-05-09T12-34-56-789Z.txt",
    );
  });

  it("signs S3 smoke requests without exposing the secret", () => {
    const url = buildRecordingStorageObjectUrl(storage, "smoke/test.txt");
    const headers = signS3Request({
      method: "PUT",
      url,
      storage,
      body: new TextEncoder().encode("ok"),
      now: new Date("2026-05-09T12:34:56.789Z"),
    });

    expect(headers.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(headers.Authorization).toContain("Credential=access-key/20260509/auto/s3/aws4_request");
    expect(headers.Authorization).not.toContain("secret-key");
    expect(headers["x-amz-date"]).toBe("20260509T123456Z");
  });

  it("reports only the missing recording storage variables", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");

    await expect(smokeRecordingStorage("smoke/test.txt")).rejects.toThrow(
      "LIVEKIT_RECORDING_S3_ACCESS_KEY, LIVEKIT_RECORDING_S3_SECRET_KEY",
    );

    vi.unstubAllEnvs();
  });
});
