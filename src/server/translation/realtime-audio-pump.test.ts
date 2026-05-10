import { describe, expect, it, vi } from "vitest";
import {
  decodePcm16Frame,
  encodePcm16Frame,
  pumpRealtimeTranslation,
  type RealtimeJsonConnection,
} from "./realtime-audio-pump";
import type { PcmAudioFrame } from "./livekit-media-adapter";

function frame(samples: number[]): PcmAudioFrame {
  return {
    data: new Int16Array(samples),
    sampleRate: 24_000,
    channels: 1,
    samplesPerChannel: samples.length,
  };
}

async function* frames(items: PcmAudioFrame[]) {
  for (const item of items) {
    yield item;
  }
}

async function* events(items: unknown[]) {
  for (const item of items) {
    yield item;
  }
}

describe("realtime audio pump", () => {
  it("round-trips PCM16 frame encoding", () => {
    const decoded = decodePcm16Frame(encodePcm16Frame(frame([1, -2, 300])));
    expect([...decoded.data]).toEqual([1, -2, 300]);
    expect(decoded.sampleRate).toBe(24_000);
    expect(decoded.channels).toBe(1);
  });

  it("sends session config and source frames while publishing translated audio deltas", async () => {
    const sent: Record<string, unknown>[] = [];
    const publishFrame = vi.fn().mockResolvedValue(undefined);
    const onTranscript = vi.fn().mockResolvedValue(undefined);
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn(async (event) => {
        sent.push(event);
      }),
      events: events([
        { type: "session.updated" },
        { type: "session.output_audio.delta", delta: encodePcm16Frame(frame([10, 20])) },
        { type: "session.output_transcript.delta", delta: "translated" },
      ]),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      pumpRealtimeTranslation({
        request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
        connect: vi.fn().mockResolvedValue(connection),
        sourceLanguage: "ko",
        targetLanguage: "en",
        sourceFrames: frames([frame([1, 2, 3])]),
        publishFrame,
        onTranscript,
      }),
    ).resolves.toEqual({ inputFrames: 1, outputFrames: 1, transcriptEvents: 1 });

    expect(sent[0]).toMatchObject({
      type: "session.update",
      session: { audio: { output: { language: "en" } } },
    });
    expect(sent[1]).toMatchObject({
      type: "input_audio_buffer.append",
      audio: expect.any(String),
    });
    expect(sent.some((event) => event.type === "input_audio_buffer.commit")).toBe(false);
    expect([...publishFrame.mock.calls[0][0].data]).toEqual([10, 20]);
    expect(onTranscript).toHaveBeenCalledWith({
      type: "transcript",
      text: "translated",
      rawType: "session.output_transcript.delta",
    });
  });

  it("waits for session.updated before forwarding source audio", async () => {
    const sent: Record<string, unknown>[] = [];
    let acknowledgeSessionUpdate: (() => void) | undefined;
    const sessionUpdated = new Promise<void>((resolve) => {
      acknowledgeSessionUpdate = resolve;
    });
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn(async (event) => {
        sent.push(event);
      }),
      events: (async function* () {
        await sessionUpdated;
        yield { type: "session.updated" };
      })(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const task = pumpRealtimeTranslation({
      request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
      connect: vi.fn().mockResolvedValue(connection),
      sourceLanguage: "ko",
      targetLanguage: "en",
      sourceFrames: frames([frame([1])]),
      publishFrame: vi.fn(),
    });

    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "session.update" });

    acknowledgeSessionUpdate?.();
    await expect(task).resolves.toMatchObject({ inputFrames: 1 });
    expect(sent[1]).toMatchObject({ type: "input_audio_buffer.append" });
  });

  it("reports first output audio only once", async () => {
    const onFirstOutputAudio = vi.fn().mockResolvedValue(undefined);
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn().mockResolvedValue(undefined),
      events: events([
        { type: "session.updated" },
        { type: "session.output_audio.delta", delta: encodePcm16Frame(frame([10])) },
        { type: "session.output_audio.delta", delta: encodePcm16Frame(frame([20])) },
      ]),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await pumpRealtimeTranslation({
      request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
      connect: vi.fn().mockResolvedValue(connection),
      sourceLanguage: "ko",
      targetLanguage: "en",
      sourceFrames: frames([frame([1])]),
      publishFrame: vi.fn().mockResolvedValue(undefined),
      onFirstOutputAudio,
    });

    expect(onFirstOutputAudio).toHaveBeenCalledTimes(1);
  });

  it("can manually commit the final source buffer for future non-VAD modes", async () => {
    const sent: Record<string, unknown>[] = [];
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn(async (event) => {
        sent.push(event);
      }),
      events: events([{ type: "session.updated" }]),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await pumpRealtimeTranslation({
      request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
      connect: vi.fn().mockResolvedValue(connection),
      sourceLanguage: "ko",
      targetLanguage: "en",
      sourceFrames: frames([frame([1])]),
      publishFrame: vi.fn(),
      manualCommitOnSourceEnd: true,
    });

    expect(sent.at(-1)).toEqual({ type: "input_audio_buffer.commit" });
  });

  it("stops forwarding source frames when the continuation guard turns false", async () => {
    const sent: Record<string, unknown>[] = [];
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn(async (event) => {
        sent.push(event);
      }),
      events: events([{ type: "session.updated" }]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const shouldContinue = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      pumpRealtimeTranslation({
        request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
        connect: vi.fn().mockResolvedValue(connection),
        sourceLanguage: "ko",
        targetLanguage: "en",
        sourceFrames: frames([frame([1]), frame([2])]),
        publishFrame: vi.fn(),
        shouldContinue,
      }),
    ).resolves.toMatchObject({ inputFrames: 1 });

    expect(sent.filter((event) => event.type === "input_audio_buffer.append")).toHaveLength(1);
  });

  it("fails fast when OpenAI sends an error event", async () => {
    const sent: Record<string, unknown>[] = [];
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn(async (event) => {
        sent.push(event);
      }),
      events: events([{ type: "error", error: { message: "Invalid audio format" } }]),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      pumpRealtimeTranslation({
        request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
        connect: vi.fn().mockResolvedValue(connection),
        sourceLanguage: "ko",
        targetLanguage: "en",
        sourceFrames: frames([frame([1]), frame([2])]),
        publishFrame: vi.fn(),
      }),
    ).rejects.toThrow("Invalid audio format");

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(sent.filter((event) => event.type === "input_audio_buffer.append").length).toBeLessThanOrEqual(1);
  });

  it("stops forwarding source frames when realtime output fails", async () => {
    const sent: Record<string, unknown>[] = [];
    async function* failingEvents() {
      throw new Error("output stream failed");
      yield;
    }
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn(async (event) => {
        sent.push(event);
      }),
      events: failingEvents(),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      pumpRealtimeTranslation({
        request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
        connect: vi.fn().mockResolvedValue(connection),
        sourceLanguage: "ko",
        targetLanguage: "en",
        sourceFrames: frames([frame([1]), frame([2])]),
        publishFrame: vi.fn(),
      }),
    ).rejects.toThrow("output stream failed");

    expect(sent.filter((event) => event.type === "input_audio_buffer.append").length).toBeLessThanOrEqual(1);
  });

  it("does not wait for another source frame after realtime output fails", async () => {
    const sent: Record<string, unknown>[] = [];
    async function* stalledFrames() {
      yield frame([1]);
      await new Promise<never>(() => undefined);
    }
    async function* failingEvents() {
      await Promise.resolve();
      throw new Error("output stream failed");
    }
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn(async (event) => {
        sent.push(event);
      }),
      events: failingEvents(),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      Promise.race([
        pumpRealtimeTranslation({
          request: { url: "wss://example.test", headers: { Authorization: "Bearer test" } },
          connect: vi.fn().mockResolvedValue(connection),
          sourceLanguage: "ko",
          targetLanguage: "en",
          sourceFrames: stalledFrames(),
          publishFrame: vi.fn(),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("pump timed out")), 250)),
      ]),
    ).rejects.toThrow("output stream failed");

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(sent.filter((event) => event.type === "input_audio_buffer.append").length).toBeLessThanOrEqual(1);
    expect(sent.some((event) => event.type === "input_audio_buffer.commit")).toBe(false);
  });
});
