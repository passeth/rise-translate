import type { SupportedLanguageCode } from "@/lib/languages";
import type { RealtimeTranscriptEvent } from "@/server/translation/openai-realtime-adapter";

export type ServerTranscriptSegment = {
  sourceText: string;
  koreanText: string;
};

export class ServerTranscriptBuffer {
  private sourceBuffer = "";
  private koreanBuffer = "";

  constructor(
    private readonly sourceLanguage: SupportedLanguageCode,
    private readonly targetLanguage: SupportedLanguageCode,
  ) {}

  push(event: RealtimeTranscriptEvent): ServerTranscriptSegment | null {
    if (isInputTranscript(event.rawType)) {
      this.sourceBuffer = appendTranscriptDelta(this.sourceBuffer, event.text);
      if (this.sourceLanguage === "ko" && shouldFlushTranscript(this.sourceBuffer)) {
        const sourceText = consumeText(() => this.sourceBuffer, (value) => (this.sourceBuffer = value));
        return { sourceText, koreanText: sourceText };
      }
      return null;
    }

    if (isOutputTranscript(event.rawType) && this.targetLanguage === "ko") {
      this.koreanBuffer = appendTranscriptDelta(this.koreanBuffer, event.text);
      if (shouldFlushTranscript(this.koreanBuffer)) {
        const koreanText = consumeText(() => this.koreanBuffer, (value) => (this.koreanBuffer = value));
        const sourceText =
          consumeText(() => this.sourceBuffer, (value) => (this.sourceBuffer = value)) ||
          `[${this.sourceLanguage} source audio]`;
        return { sourceText, koreanText };
      }
    }

    return null;
  }
}

function appendTranscriptDelta(current: string, delta: string) {
  return `${current}${delta}`.replace(/\s+/g, " ");
}

function shouldFlushTranscript(text: string) {
  const trimmed = text.trim();
  return trimmed.length >= 80 || /[.!?。？！]\s*$/.test(trimmed);
}

function consumeText(get: () => string, set: (value: string) => void) {
  const value = get().trim();
  set("");
  return value;
}

function isInputTranscript(rawType: string) {
  return rawType === "session.input_transcript.delta" || rawType.includes("input_audio_transcription");
}

function isOutputTranscript(rawType: string) {
  return rawType === "session.output_transcript.delta" || rawType.includes("audio_transcript") || rawType.includes("output_text");
}
