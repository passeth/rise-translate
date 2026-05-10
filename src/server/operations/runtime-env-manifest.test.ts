import { describe, expect, it } from "vitest";
import {
  RUNTIME_ENV_MANIFEST,
  checkRuntimeEnv,
  formatRuntimeEnvManifest,
  formatRuntimeEnvTemplate,
  getRuntimeEnvManifest,
} from "./runtime-env-manifest";

describe("runtime environment manifest", () => {
  it("documents the shared web and worker environment contract", () => {
    expect(getRuntimeEnvManifest("worker").map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "LIVEKIT_URL",
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "OPENAI_API_KEY",
        "OPENAI_TRANSLATION_MODEL",
        "OPENAI_TRANSCRIPTION_MODEL",
        "INTERNAL_WORKER_TOKEN",
        "TRANSLATION_WORKER_ADAPTER",
        "TRANSLATION_WORKER_DRY_RUN",
      ]),
    );
  });

  it("keeps recording storage variables web-only because LiveKit Egress is controlled by API routes", () => {
    expect(getRuntimeEnvManifest("worker").map((entry) => entry.name)).not.toContain("LIVEKIT_RECORDING_S3_SECRET_KEY");
    expect(getRuntimeEnvManifest("web").map((entry) => entry.name)).toContain("LIVEKIT_RECORDING_S3_SECRET_KEY");
  });

  it("marks credentials as secret so documentation can avoid printing values", () => {
    const secretNames = RUNTIME_ENV_MANIFEST.filter((entry) => entry.secret).map((entry) => entry.name);

    expect(secretNames).toEqual(
      expect.arrayContaining(["SUPABASE_SERVICE_ROLE_KEY", "LIVEKIT_API_SECRET", "OPENAI_API_KEY"]),
    );
    expect(formatRuntimeEnvManifest("web")).toContain("OPENAI_API_KEY (secret");
  });

  it("checks missing required variables without requiring optional defaults", () => {
    expect(
      checkRuntimeEnv("web", {
        NEXT_PUBLIC_APP_URL: "https://meet.example.com",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        APP_ENCRYPTION_KEY_BASE64: "encryption",
        LIVEKIT_URL: "wss://example.livekit.cloud",
        LIVEKIT_API_KEY: "livekit-key",
        LIVEKIT_API_SECRET: "livekit-secret",
        OPENAI_API_KEY: "openai-key",
        OPENAI_TRANSLATION_MODEL: "gpt-realtime-translate",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-realtime-whisper",
        INTERNAL_WORKER_TOKEN: "internal",
        TRANSLATION_WORKER_ADAPTER: "livekit-node",
        TRANSLATION_WORKER_DRY_RUN: "false",
        LIVEKIT_RECORDING_S3_BUCKET: "recordings",
        LIVEKIT_RECORDING_S3_ACCESS_KEY: "storage-key",
        LIVEKIT_RECORDING_S3_SECRET_KEY: "storage-secret",
      }),
    ).toMatchObject({ ok: true, missing: [] });
  });

  it("reports missing worker variables separately from web-only recording variables", () => {
    expect(checkRuntimeEnv("worker", { NEXT_PUBLIC_APP_URL: "https://meet.example.com" })).toMatchObject({
      ok: false,
      missing: expect.arrayContaining(["SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]),
    });
    expect(checkRuntimeEnv("worker", { NEXT_PUBLIC_APP_URL: "https://meet.example.com" }).missing).not.toContain(
      "LIVEKIT_RECORDING_S3_SECRET_KEY",
    );
  });

  it("prints deployable dotenv templates without placeholder secret values", () => {
    const workerTemplate = formatRuntimeEnvTemplate("worker");

    expect(workerTemplate).toContain("OPENAI_TRANSLATION_MODEL=gpt-realtime-translate");
    expect(workerTemplate).toContain("TRANSLATION_WORKER_ADAPTER=livekit-node");
    expect(workerTemplate).toContain(["OPENAI", "API", "KEY"].join("_") + "=");
    expect(workerTemplate).not.toContain("filled-secret-value");
  });
});
