import { describe, expect, it } from "vitest";
import { describeRealtimePcmFormat, REALTIME_PCM_FORMAT } from "./audio-format";

describe("Realtime audio format", () => {
  it("documents strict PCM16 24kHz mono boundary", () => {
    expect(REALTIME_PCM_FORMAT).toEqual({ encoding: "pcm16", sampleRate: 24000, channels: 1 });
    expect(describeRealtimePcmFormat()).toBe("pcm16 24000Hz mono (1 channel)");
  });
});
