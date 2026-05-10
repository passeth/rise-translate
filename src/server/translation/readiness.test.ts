import { describe, expect, it, vi } from "vitest";
import { assertServerTranslationReady, getServerTranslationReadiness, TranslationWorkerNotReadyError } from "./readiness";

describe("server translation readiness", () => {
  it("fails closed unless dry-run is explicitly enabled", () => {
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");

    expect(getServerTranslationReadiness()).toMatchObject({ ready: false, mode: "unavailable" });
    expect(() => assertServerTranslationReady()).toThrow(TranslationWorkerNotReadyError);

    vi.unstubAllEnvs();
  });

  it("allows explicit dry-run smoke testing", () => {
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "true");

    expect(assertServerTranslationReady()).toMatchObject({ ready: true, mode: "dry-run" });

    vi.unstubAllEnvs();
  });

  it("blocks dry-run when live server interpretation is required", () => {
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "true");

    expect(getServerTranslationReadiness({ allowDryRun: false })).toMatchObject({
      ready: false,
      mode: "dry-run",
    });
    expect(() => assertServerTranslationReady({ allowDryRun: false })).toThrow(TranslationWorkerNotReadyError);

    vi.unstubAllEnvs();
  });

  it("allows the LiveKit Node media worker when required provider credentials are present", () => {
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");
    vi.stubEnv("TRANSLATION_WORKER_ADAPTER", "livekit-node");
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "livekit-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "livekit-secret");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    expect(assertServerTranslationReady()).toMatchObject({ ready: true, mode: "livekit-node" });

    vi.unstubAllEnvs();
  });

  it("keeps LiveKit Node mode blocked when provider credentials are incomplete", () => {
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");
    vi.stubEnv("TRANSLATION_WORKER_ADAPTER", "livekit-node");
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");

    expect(getServerTranslationReadiness()).toMatchObject({
      ready: false,
      mode: "livekit-node",
      message: expect.stringContaining("LIVEKIT_API_KEY"),
    });

    vi.unstubAllEnvs();
  });
});
