import { describe, expect, it } from "vitest";
import { ServerTranscriptBuffer } from "./server-transcript-buffer";

describe("ServerTranscriptBuffer", () => {
  it("pairs Korean source transcript with target-language captions", () => {
    const buffer = new ServerTranscriptBuffer("ko", "en");

    expect(buffer.push({ type: "transcript", rawType: "session.input_transcript.delta", text: "안녕하세요." })).toBeNull();
    expect(buffer.push({ type: "transcript", rawType: "session.output_transcript.delta", text: "Hello." })).toEqual({
      sourceText: "안녕하세요.",
      koreanText: "안녕하세요.",
      targetLanguage: "en",
      translatedText: "Hello.",
    });
  });

  it("pairs non-Korean source input with Korean output transcript", () => {
    const buffer = new ServerTranscriptBuffer("en", "ko");

    expect(buffer.push({ type: "transcript", rawType: "session.input_transcript.delta", text: "We can ship next week. " })).toBeNull();
    expect(buffer.push({ type: "transcript", rawType: "session.output_transcript.delta", text: "다음 주에 배송할 수 있습니다." })).toEqual({
      sourceText: "We can ship next week.",
      koreanText: "다음 주에 배송할 수 있습니다.",
      targetLanguage: "ko",
      translatedText: "다음 주에 배송할 수 있습니다.",
    });
  });

  it("persists non-Korean target output as caption metadata", () => {
    const buffer = new ServerTranscriptBuffer("ja", "en");

    expect(buffer.push({ type: "transcript", rawType: "session.input_transcript.delta", text: "来週出荷できます。" })).toBeNull();
    expect(buffer.push({ type: "transcript", rawType: "session.output_transcript.delta", text: "We can ship next week." })).toEqual({
      sourceText: "来週出荷できます。",
      koreanText: "来週出荷できます。",
      targetLanguage: "en",
      translatedText: "We can ship next week.",
    });
  });
});
