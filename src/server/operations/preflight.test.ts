import { describe, expect, it, vi } from "vitest";
import { getProductionReadinessChecks, summarizeProductionReadiness } from "./preflight";

const validEncryptionKey = Buffer.alloc(32, 1).toString("base64");

describe("production preflight checks", () => {
  it("reports blockers without exposing secret values", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://meet.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");

    const checks = getProductionReadinessChecks();
    const serialized = JSON.stringify(checks);

    expect(checks.some((check) => check.severity === "blocked")).toBe(true);
    expect(serialized).not.toContain("service-role-secret");
    expect(serialized).not.toContain("openai-secret");
    expect(summarizeProductionReadiness(checks)).toMatchObject({ severity: "blocked" });

    vi.unstubAllEnvs();
  });

  it("blocks dry-run translation for buyer-meeting readiness", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://meet.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    vi.stubEnv("APP_ENCRYPTION_KEY_BASE64", validEncryptionKey);
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "livekit-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "livekit-secret");
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    vi.stubEnv("OPENAI_NOTES_MODEL", "gpt-test");
    vi.stubEnv("INTERNAL_WORKER_TOKEN", "worker-secret");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "storage-key");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "storage-secret");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ENDPOINT", "https://storage.example.com");
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "true");

    const checks = getProductionReadinessChecks();

    expect(checks.find((check) => check.id === "server-translation-worker")).toMatchObject({ severity: "blocked" });
    expect(summarizeProductionReadiness(checks)).toMatchObject({ severity: "blocked" });

    vi.unstubAllEnvs();
  });


  it("allows recording storage endpoint to be derived from Supabase URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://meet.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");
    vi.stubEnv("LIVEKIT_RECORDING_S3_ACCESS_KEY", "storage-key");
    vi.stubEnv("LIVEKIT_RECORDING_S3_SECRET_KEY", "storage-secret");

    expect(getProductionReadinessChecks().find((check) => check.id === "recording-storage")).toMatchObject({
      severity: "ok",
      message: expect.stringContaining("derived from Supabase URL"),
    });

    vi.unstubAllEnvs();
  });

  it("reports which required recording storage variables are missing", () => {
    vi.stubEnv("LIVEKIT_RECORDING_S3_BUCKET", "recordings");

    expect(getProductionReadinessChecks().find((check) => check.id === "recording-storage")).toMatchObject({
      severity: "blocked",
      message: expect.stringContaining("LIVEKIT_RECORDING_S3_ACCESS_KEY"),
      action: expect.stringContaining("pnpm recording:storage:smoke"),
    });

    vi.unstubAllEnvs();
  });

  it("blocks localhost invitation URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");

    expect(getProductionReadinessChecks().find((check) => check.id === "app-url")).toMatchObject({
      severity: "blocked",
      action: expect.stringContaining("NEXT_PUBLIC_APP_URL"),
    });

    vi.unstubAllEnvs();
  });

  it("blocks non-HTTPS public app URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://meet.example.com");
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");

    expect(getProductionReadinessChecks().find((check) => check.id === "app-url")).toMatchObject({
      severity: "blocked",
      message: expect.stringContaining("HTTPS"),
    });

    vi.unstubAllEnvs();
  });

  it("blocks invalid app encryption keys before meeting passwords are created", () => {
    vi.stubEnv("APP_ENCRYPTION_KEY_BASE64", "not-a-32-byte-base64-key");

    expect(getProductionReadinessChecks().find((check) => check.id === "app-encryption-key")).toMatchObject({
      severity: "blocked",
      message: expect.stringContaining("32 bytes"),
    });

    vi.unstubAllEnvs();
  });

  it("blocks insecure LiveKit URLs for production media", () => {
    vi.stubEnv("LIVEKIT_URL", "ws://example.livekit.local");

    expect(getProductionReadinessChecks().find((check) => check.id === "livekit-url")).toMatchObject({
      severity: "blocked",
      message: expect.stringContaining("wss://"),
    });

    vi.unstubAllEnvs();
  });

  it("shows the required server worker smoke command when livekit-node mode is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://meet.example.com");
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "livekit-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "livekit-secret");
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");
    vi.stubEnv("TRANSLATION_WORKER_ADAPTER", "livekit-node");

    expect(getProductionReadinessChecks().find((check) => check.id === "server-translation-worker")).toMatchObject({
      severity: "warning",
      message: expect.stringContaining("pnpm translation:worker:smoke"),
      action: expect.stringContaining("Live QA checklist"),
    });

    vi.unstubAllEnvs();
  });
});
