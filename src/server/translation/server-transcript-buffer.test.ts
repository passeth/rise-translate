import { describe, expect, it } from "vitest";
import { ServerTranscriptBuffer } from "./server-transcript-buffer";

describe("ServerTranscriptBuffer", () => {
  it("persists Korean source transcript directly for Korean speakers", () => {
    const buffer = new ServerTranscriptBuffer("ko", "en");

    expect(buffer.push({ type: "transcript", rawType: "session.input_transcript.delta", text: "안녕하세요." })).toEqual({
      sourceText: "안녕하세요.",
      koreanText: "안녕하세요.",
    });
  });

  it("pairs non-Korean source input with Korean output transcript", () => {
    const buffer = new ServerTranscriptBuffer("en", "ko");

    expect(buffer.push({ type: "transcript", rawType: "session.input_transcript.delta", text: "We can ship next week. " })).toBeNull();
    expect(buffer.push({ type: "transcript", rawType: "session.output_transcript.delta", text: "다음 주에 배송할 수 있습니다." })).toEqual({
      sourceText: "We can ship next week.",
      koreanText: "다음 주에 배송할 수 있습니다.",
    });
  });

  it("ignores non-Korean output lanes for permanent Korean notes", () => {
    const buffer = new ServerTranscriptBuffer("ja", "en");

    expect(buffer.push({ type: "transcript", rawType: "session.output_transcript.delta", text: "Hello." })).toBeNull();
  });
});
