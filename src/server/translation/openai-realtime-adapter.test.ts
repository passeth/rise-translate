import { describe, expect, it, vi } from "vitest";
import { buildOpenAIRealtimeWebSocketRequest, parseRealtimeEvent } from "./openai-realtime-adapter";

describe("OpenAI Realtime adapter", () => {
  it("builds websocket request with Authorization header", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");

    expect(buildOpenAIRealtimeWebSocketRequest()).toEqual({
      url: "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-test",
      headers: {
        Authorization: "Bearer test-key",
      },
    });

    vi.unstubAllEnvs();
  });

  it("parses documented translation audio delta event names", () => {
    expect(parseRealtimeEvent({ type: "session.output_audio.delta", delta: "live" })).toMatchObject({
      type: "audio_delta",
      base64Audio: "live",
    });
    expect(parseRealtimeEvent({ type: "response.output_audio.delta", delta: "aaa" })).toMatchObject({
      type: "audio_delta",
      base64Audio: "aaa",
    });
    expect(parseRealtimeEvent({ type: "response.audio.delta", delta: "bbb" })).toMatchObject({
      type: "audio_delta",
      base64Audio: "bbb",
    });
  });

  it("parses realtime error events so the media pump can fail fast", () => {
    expect(parseRealtimeEvent({ type: "error", error: { message: "Invalid audio format" } })).toMatchObject({
      type: "error",
      message: "Invalid audio format",
      rawType: "error",
    });
    expect(
      parseRealtimeEvent({
        type: "response.done",
        response: {
          status: "failed",
          status_details: { error: { message: "Translation response failed" } },
        },
      }),
    ).toMatchObject({
      type: "error",
      message: "Translation response failed",
      rawType: "response.done",
    });
  });

  it("parses session update acknowledgements", () => {
    expect(parseRealtimeEvent({ type: "session.updated", session: { type: "translation" } })).toEqual({
      type: "session_updated",
      rawType: "session.updated",
    });
  });

  it("parses documented translation transcript event names", () => {
    expect(parseRealtimeEvent({ type: "session.output_transcript.delta", delta: "hola" })).toMatchObject({
      type: "transcript",
      text: "hola",
    });
    expect(parseRealtimeEvent({ type: "session.input_transcript.delta", delta: "hello" })).toMatchObject({
      type: "transcript",
      text: "hello",
    });
    expect(parseRealtimeEvent({ type: "response.output_audio_transcript.delta", delta: "bonjour" })).toMatchObject({
      type: "transcript",
      text: "bonjour",
    });
  });
});
