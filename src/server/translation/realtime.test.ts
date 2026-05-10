import { describe, expect, it, vi } from "vitest";
import {
  buildRealtimeTranslationSessionConfig,
  getRealtimeWebSocketUrl,
} from "./realtime";

describe("OpenAI realtime translation config", () => {
  it("uses env-fixed translation model and translation-session audio settings", () => {
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "gpt-realtime-whisper-test");

    const config = buildRealtimeTranslationSessionConfig({ sourceLanguage: "ja", targetLanguage: "ko" });

    expect(config.model).toBe("gpt-realtime-test");
    expect(config.audio.input.noise_reduction).toEqual({ type: "far_field" });
    expect(config.audio.input.transcription).toMatchObject({ model: "gpt-realtime-whisper-test" });
    expect(config.audio.output).toMatchObject({ language: "ko" });
    expect(config).not.toHaveProperty("instructions");

    vi.unstubAllEnvs();
  });

  it("builds the websocket URL without exposing credentials", () => {
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");

    expect(getRealtimeWebSocketUrl()).toBe(
      "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-test",
    );

    vi.unstubAllEnvs();
  });
});
