import { describe, expect, it } from "vitest";
import { getTranscriptDelta, shouldPersistTranscriptChunk } from "./transcript-buffer";

describe("transcript buffering", () => {
  it("extracts only newly advanced transcript text", () => {
    expect(getTranscriptDelta("Hello", "Hello buyer team")).toBe("buyer team");
    expect(getTranscriptDelta("Different", "새로운 문장입니다")).toBe("새로운 문장입니다");
  });

  it("waits for meaningful chunk length or sentence boundary", () => {
    expect(shouldPersistTranscriptChunk({ sourceDelta: "short" })).toBe(false);
    expect(shouldPersistTranscriptChunk({ sourceDelta: "This is a complete sentence." })).toBe(true);
    expect(shouldPersistTranscriptChunk({ sourceDelta: "x".repeat(80) })).toBe(true);
  });
});
