import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerRealtimeTranslationBridge } from "./livekit-openai-bridge";
import { publishTranslationStatus } from "@/server/translation/livekit-status";
import { encodePcm16Frame, type RealtimeJsonConnection } from "./realtime-audio-pump";
import type { LiveKitMediaAdapter, PcmAudioFrame } from "./livekit-media-adapter";

vi.mock("@/server/translation/livekit-status", () => ({
  publishTranslationStatus: vi.fn().mockResolvedValue(undefined),
}));

const startRequest = {
  sessionId: "session-1",
  meetingId: "meeting-1",
  livekitRoomName: "lk_room",
  sourceParticipantIdentity: "guest_1",
  sourceLanguage: "ja" as const,
  targetLanguage: "ko" as const,
  targetTrackName: "translation-ko",
};

function pcmFrame(samples: number[]): PcmAudioFrame {
  return {
    data: new Int16Array(samples),
    sampleRate: 24_000,
    channels: 1,
    samplesPerChannel: samples.length,
  };
}

async function* iterable<T>(items: T[]) {
  for (const item of items) yield item;
}

describe("ServerRealtimeTranslationBridge", () => {
  beforeEach(() => {
    vi.mocked(publishTranslationStatus).mockClear();
  });

  it("prepares one mic source, one realtime request, and one translated track in dry-run mode", async () => {
    const liveKit = {
      attachToRoom: vi.fn().mockResolvedValue(undefined),
      subscribeToParticipantMicrophone: vi.fn().mockResolvedValue({
        roomName: "lk_room",
        participantIdentity: "guest_1",
        trackSource: "microphone" as const,
        format: { encoding: "pcm16" as const, sampleRate: 24_000 as const, channels: 1 as const },
      }),
      createTranslatedAudioPublisher: vi.fn().mockResolvedValue({
        roomName: "lk_room",
        trackName: "translation-ko",
        format: { encoding: "pcm16" as const, sampleRate: 24_000 as const, channels: 1 as const },
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const bridge = new ServerRealtimeTranslationBridge({
      liveKit,
      dryRun: true,
      realtimeRequestFactory: () => ({
        url: "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-test",
        headers: { Authorization: "Bearer test-key" },
      }),
    });

    await expect(
      bridge.start(startRequest),
    ).resolves.toMatchObject({
      status: "connected",
      message: expect.stringContaining("translation-ko"),
    });
    expect(liveKit.close).toHaveBeenCalledTimes(1);
  });

  it("fails closed by default so dry-run workers cannot look production-connected", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");
    vi.stubEnv("TRANSLATION_WORKER_DRY_RUN", "false");
    const bridge = new ServerRealtimeTranslationBridge();

    await expect(bridge.start(startRequest)).resolves.toMatchObject({
      status: "failed",
      message: expect.stringContaining("not production-capable"),
    });

    vi.unstubAllEnvs();
  });

  it("does not claim live media pumping when dryRun is disabled without a production adapter", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_TRANSLATION_MODEL", "gpt-realtime-test");
    const bridge = new ServerRealtimeTranslationBridge({ dryRun: false });

    await expect(bridge.start(startRequest)).resolves.toMatchObject({ status: "failed" });

    vi.unstubAllEnvs();
  });

  it("closes the LiveKit adapter when setup fails before the media pump starts", async () => {
    const liveKit = {
      attachToRoom: vi.fn().mockResolvedValue(undefined),
      subscribeToParticipantMicrophone: vi.fn().mockRejectedValue(new Error("source participant missing")),
      createTranslatedAudioPublisher: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const bridge = new ServerRealtimeTranslationBridge({
      liveKit,
      dryRun: false,
      realtimeRequestFactory: () => ({
        url: "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-test",
        headers: { Authorization: "Bearer test-key" },
      }),
    });

    await expect(bridge.start(startRequest)).rejects.toThrow("source participant missing");
    expect(liveKit.close).toHaveBeenCalledTimes(1);
  });


  it("does not publish a translated LiveKit track before the first OpenAI audio frame", async () => {
    const liveKit: LiveKitMediaAdapter = {
      attachToRoom: vi.fn().mockResolvedValue(undefined),
      subscribeToParticipantMicrophone: vi.fn().mockResolvedValue({
        roomName: "lk_room",
        participantIdentity: "guest_1",
        trackSource: "microphone",
        format: { encoding: "pcm16", sampleRate: 24_000, channels: 1 },
        frames: iterable([]),
      }),
      createTranslatedAudioPublisher: vi.fn().mockResolvedValue({
        roomName: "lk_room",
        trackName: "translation-ko",
        format: { encoding: "pcm16", sampleRate: 24_000, channels: 1 },
        publishFrame: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn().mockResolvedValue(undefined),
      events: iterable([{ type: "session.updated" }]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const statusUpdater = { updateStatus: vi.fn().mockResolvedValue(undefined) };
    const bridge = new ServerRealtimeTranslationBridge({
      liveKit,
      dryRun: false,
      statusUpdater,
      realtimeRequestFactory: () => ({
        url: "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-test",
        headers: { Authorization: "Bearer test-key" },
      }),
      realtimeConnectionFactory: vi.fn().mockResolvedValue(connection),
    });

    await expect(bridge.start(startRequest)).resolves.toMatchObject({ status: "starting" });

    expect(liveKit.createTranslatedAudioPublisher).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(statusUpdater.updateStatus).toHaveBeenCalledWith("session-1", "stopped", { heartbeat: true });
    });
  });

  it("runs the realtime media pump when production-capable adapters are injected", async () => {
    const published: PcmAudioFrame[] = [];
    const liveKit: LiveKitMediaAdapter = {
      attachToRoom: vi.fn().mockResolvedValue(undefined),
      subscribeToParticipantMicrophone: vi.fn().mockResolvedValue({
        roomName: "lk_room",
        participantIdentity: "guest_1",
        trackSource: "microphone",
        format: { encoding: "pcm16", sampleRate: 24_000, channels: 1 },
        frames: iterable([pcmFrame([1, 2])]),
      }),
      createTranslatedAudioPublisher: vi.fn().mockResolvedValue({
        roomName: "lk_room",
        trackName: "translation-ko",
        format: { encoding: "pcm16", sampleRate: 24_000, channels: 1 },
        publishFrame: async (frame: PcmAudioFrame) => {
          published.push(frame);
        },
      }),
    };
    const connection: RealtimeJsonConnection = {
      sendJson: vi.fn().mockResolvedValue(undefined),
      events: iterable([{ type: "session.updated" }, { type: "session.output_audio.delta", delta: encodePcm16Frame(pcmFrame([9, 10])) }]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const statusUpdater = { updateStatus: vi.fn().mockResolvedValue(undefined) };
    const bridge = new ServerRealtimeTranslationBridge({
      liveKit,
      dryRun: false,
      statusUpdater,
      realtimeRequestFactory: () => ({
        url: "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-test",
        headers: { Authorization: "Bearer test-key" },
      }),
      realtimeConnectionFactory: vi.fn().mockResolvedValue(connection),
    });

    await expect(bridge.start(startRequest)).resolves.toMatchObject({
      status: "starting",
      message: expect.stringContaining("waiting for first translated audio"),
    });
    await vi.waitFor(() => {
      expect(published.map((frame) => [...frame.data])).toEqual([[9, 10]]);
    });
    expect(statusUpdater.updateStatus).toHaveBeenCalledWith("session-1", "connected", { heartbeat: true });
    expect(publishTranslationStatus).toHaveBeenCalledWith(
      "lk_room",
      expect.objectContaining({
        meetingId: "meeting-1",
        sourceIdentity: "guest_1",
        status: "connected",
        targetLanguage: "ko",
        type: "translation_status",
      }),
    );
    await vi.waitFor(() => {
      expect(statusUpdater.updateStatus).toHaveBeenCalledWith("session-1", "stopped", { heartbeat: true });
    });
    expect(publishTranslationStatus).toHaveBeenCalledWith(
      "lk_room",
      expect.objectContaining({
        meetingId: "meeting-1",
        sourceIdentity: "guest_1",
        status: "stopped",
        targetLanguage: "ko",
        type: "translation_status",
      }),
    );
  });
});
