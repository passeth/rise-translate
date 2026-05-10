import { describe, expect, it, vi } from "vitest";
import {
  createRecordingObjectKey,
  deriveSupabaseStorageS3Endpoint,
  getRecordingStorageConfig,
  getRecordingStorageReadiness,
} from "./livekit-egress";

describe("recording LiveKit egress storage config", () => {
  it("derives Supabase Storage S3 endpoint when no explicit endpoint is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "storage-key");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "storage-secret");
    vi.stubEnv("LIVEKIT_RECORDING_S3_REGION", "auto");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ENDPOINT", "");

    expect(getRecordingStorageConfig()).toMatchObject({
      bucket: "recordings",
      endpoint: "https://example.storage.supabase.co/storage/v1/s3",
      forcePathStyle: true,
      region: "auto",
    });

    vi.unstubAllEnvs();
  });

  it("derives the direct Supabase Storage hostname for S3 uploads", () => {
    expect(deriveSupabaseStorageS3Endpoint("https://project-ref.supabase.co")).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/s3",
    );
    expect(deriveSupabaseStorageS3Endpoint("https://project-ref.storage.supabase.co/storage/v1/object")).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/s3",
    );
    expect(deriveSupabaseStorageS3Endpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/s3",
    );
  });

  it("uses an explicit S3 endpoint and path-style flag when provided", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "storage-key");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "storage-secret");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ENDPOINT", "https://s3.example.com");
    vi.stubEnv("LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE", "false");

    expect(getRecordingStorageConfig()).toMatchObject({
      endpoint: "https://s3.example.com",
      forcePathStyle: false,
    });

    vi.unstubAllEnvs();
  });

  it("returns null until required storage credentials are configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");

    expect(getRecordingStorageConfig()).toBeNull();

    vi.unstubAllEnvs();
  });

  it("reports missing storage credentials without exposing secrets", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "");

    expect(getRecordingStorageReadiness()).toEqual({
      configured: false,
      missingEnv: ["LIVEKIT_RECORDING_S3_ACCESS_KEY", "LIVEKIT_RECORDING_S3_SECRET_KEY"],
      message:
        "Recording storage is not configured. Missing: LIVEKIT_RECORDING_S3_ACCESS_KEY, LIVEKIT_RECORDING_S3_SECRET_KEY.",
    });

    vi.unstubAllEnvs();
  });

  it("reports configured storage without returning credential values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "storage-key");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "storage-secret");

    expect(getRecordingStorageReadiness()).toEqual({
      configured: true,
      missingEnv: [],
      message: "Recording storage is configured; Supabase Storage S3 endpoint will be derived from Supabase URL.",
    });

    vi.unstubAllEnvs();
  });

  it("builds stable meeting-scoped mp4 object keys", () => {
    expect(
      createRecordingObjectKey(
        "meeting-1",
        "recording-1",
        new Date("2026-05-09T10:11:12.345Z"),
      ),
    ).toBe("meetings/meeting-1/recordings/2026-05-09T10-11-12-345Z-recording-1.mp4");
  });
});
