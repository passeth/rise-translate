import { describe, expect, it } from "vitest";
import {
  DEFAULT_INPUT_TRANSCRIPTION_MODEL,
  DEFAULT_TRANSLATION_MODEL,
  REALTIME_TRANSLATION_CLIENT_SECRET_URL,
  buildSessionUpdate,
  buildTranslationClientSecretRequest,
  normalizeTranslationLanguage,
} from "./realtime-translation-config";

describe("Realtime Translation config", () => {
  it("normalizes only supported meeting languages", () => {
    expect(normalizeTranslationLanguage("KO")).toBe("ko");
    expect(normalizeTranslationLanguage(" vi ")).toBe("vi");
    expect(() => normalizeTranslationLanguage("fr")).toThrow("Unsupported translation language");
  });

  it("builds a cookbook-compatible translation client-secret request without exposing the server API key in the body", () => {
    const request = buildTranslationClientSecretRequest({
      apiKey: "sk-test",
      language: "ja",
      sourceLanguage: "ko",
      inputTranscriptionEnabled: true,
      noiseReductionEnabled: true,
    });

    const body = JSON.parse(String(request.init.body));

    expect(request.url).toBe(REALTIME_TRANSLATION_CLIENT_SECRET_URL);
    expect(request.init.method).toBe("POST");
    expect(request.init.headers).toMatchObject({ Authorization: "Bearer sk-test" });
    expect(body.session.model).toBe(DEFAULT_TRANSLATION_MODEL);
    expect(body.session).not.toHaveProperty("instructions");
    expect(body.session.audio.input).toMatchObject({
      transcription: {
        model: DEFAULT_INPUT_TRANSCRIPTION_MODEL,
      },
      noise_reduction: { type: "far_field" },
    });
    expect(body.session.audio.output).toMatchObject({
      language: "ja",
    });
    expect(String(request.init.body)).not.toContain("sk-test");
  });

  it("builds runtime session updates without model", () => {
    const event = buildSessionUpdate({
      language: "ru",
      sourceLanguage: "ko",
      inputTranscriptionEnabled: false,
      noiseReductionEnabled: false,
    });

    expect(event.type).toBe("session.update");
    expect(event.session).not.toHaveProperty("model");
    expect(event.session).not.toHaveProperty("instructions");
    expect(event.session.audio.input).toMatchObject({
      noise_reduction: null,
    });
    expect(event.session.audio.output).toMatchObject({
      language: "ru",
    });
  });

  it("uses an injected input transcription model when provided", () => {
    const request = buildTranslationClientSecretRequest({
      apiKey: "sk-test",
      language: "en",
      sourceLanguage: "ko",
      inputTranscriptionEnabled: true,
      inputTranscriptionModel: "custom-transcribe-model",
      noiseReductionEnabled: true,
    });
    const body = JSON.parse(String(request.init.body));

    expect(body.session.audio.input.transcription.model).toBe("custom-transcribe-model");
  });

});
