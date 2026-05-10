import { describe, expect, it, vi } from "vitest";
import { smokeOpenAIAuth } from "@/server/openai/smoke";
import type { RealtimeJsonConnectionFactory } from "@/server/translation/realtime-audio-pump";

function fakeRealtimeConnect(events: unknown[] = [{ type: "session.updated" }]) {
  const sent: Record<string, unknown>[] = [];
  const connect = vi.fn(async () => ({
    sendJson: vi.fn(async (event: Record<string, unknown>) => {
      sent.push(event);
    }),
    events: (async function* () {
      for (const event of events) yield event;
    })(),
    close: vi.fn().mockResolvedValue(undefined),
  })) satisfies RealtimeJsonConnectionFactory;

  return { connect, sent };
}

describe("smokeOpenAIAuth", () => {
  it("checks OpenAI auth without exposing the API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "gpt-realtime-whisper-test");
    vi.stubEnv("OPENAI_NOTES_MODEL", "gpt-notes-test");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: "gpt-realtime-test" },
            { id: "gpt-notes-test" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          value: "ek_test",
          session: { type: "translation" },
        }),
      });
    const realtime = fakeRealtimeConnect();

    await expect(smokeOpenAIAuth(fetchImpl as unknown as typeof fetch, realtime.connect)).resolves.toEqual({
      translationModel: "gpt-realtime-test",
      transcriptionModel: "gpt-realtime-whisper-test",
      notesModel: "gpt-notes-test",
      checkedModels: ["gpt-realtime-test", "gpt-notes-test"],
      visibleModelCount: 2,
      realtimeTranslationClientSecret: {
        created: true,
        sessionType: "translation",
      },
      realtimeTranslationWebSocket: {
        sessionUpdated: true,
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-openai-key" },
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/translations/client_secrets",
      expect.objectContaining({
        body: expect.not.stringContaining("test-openai-key"),
        headers: expect.objectContaining({ Authorization: "Bearer test-openai-key" }),
      }),
    );
    expect(realtime.sent[0]).toMatchObject({
      type: "session.update",
      session: {
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper-test" },
          },
          output: { language: "en" },
        },
      },
    });

    vi.unstubAllEnvs();
  });

  it("fails when configured models are not visible to the key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "missing-translation-model");
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "gpt-realtime-whisper-test");
    vi.stubEnv("OPENAI_NOTES_MODEL", "gpt-notes-test");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [{ id: "gpt-notes-test" }] }),
      });
    const realtime = fakeRealtimeConnect();

    await expect(smokeOpenAIAuth(fetchImpl as unknown as typeof fetch, realtime.connect)).rejects.toThrow(
      "missing-translation-model",
    );

    vi.unstubAllEnvs();
  });

  it("uses the default notes model when none is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "gpt-realtime-whisper-test");
    vi.stubEnv("OPENAI_NOTES_MODEL", "");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: "gpt-realtime-test" },
            { id: "gpt-4.1-mini" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          value: "ek_test",
          session: { type: "translation" },
        }),
      });
    const realtime = fakeRealtimeConnect();

    await expect(smokeOpenAIAuth(fetchImpl as unknown as typeof fetch, realtime.connect)).resolves.toMatchObject({
      notesModel: "gpt-4.1-mini",
      visibleModelCount: 2,
    });

    vi.unstubAllEnvs();
  });

  it("fails when realtime translation client-secret creation rejects the configured payload", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "bad-transcription-model");
    vi.stubEnv("OPENAI_NOTES_MODEL", "gpt-notes-test");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: "gpt-realtime-test" },
            { id: "gpt-notes-test" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: { message: "Invalid transcription model", param: "session.audio.input.transcription.model" },
        }),
      });
    const realtime = fakeRealtimeConnect();

    await expect(smokeOpenAIAuth(fetchImpl as unknown as typeof fetch, realtime.connect)).rejects.toThrow(
      "Invalid transcription model",
    );

    vi.unstubAllEnvs();
  });

  it("fails closed on OpenAI auth errors", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const realtime = fakeRealtimeConnect();

    await expect(smokeOpenAIAuth(fetchImpl as unknown as typeof fetch, realtime.connect)).rejects.toThrow("HTTP 401");

    vi.unstubAllEnvs();
  });

  it("fails when realtime translation WebSocket rejects the session update", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");
    vi.stubEnv("OPENAI_TRANSCRIPTION_MODEL", "bad-transcription-model");
    vi.stubEnv("OPENAI_NOTES_MODEL", "gpt-notes-test");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: "gpt-realtime-test" },
            { id: "gpt-notes-test" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          value: "ek_test",
          session: { type: "translation" },
        }),
      });
    const realtime = fakeRealtimeConnect([
      {
        type: "error",
        error: { message: "Invalid session update" },
      },
    ]);

    await expect(smokeOpenAIAuth(fetchImpl as unknown as typeof fetch, realtime.connect)).rejects.toThrow(
      "Invalid session update",
    );

    vi.unstubAllEnvs();
  });
});
