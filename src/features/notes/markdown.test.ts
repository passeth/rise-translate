import { describe, expect, it } from "vitest";
import {
  buildMeetingNotesMarkdown,
  buildNotesModelInput,
  buildNotesModelPrompt,
  parseNotesModelSummary,
  type NotesChatMessage,
  type NotesTranscriptSegment,
} from "./markdown";

const transcript: NotesTranscriptSegment[] = [
  {
    sequence: 1,
    startedAt: "2026-05-09T01:00:00.000Z",
    endedAt: "2026-05-09T01:00:03.000Z",
    speakerName: "Ivan",
    speakerCompany: "BuyerCo",
    sourceLanguage: "ru",
    sourceText: "Цена слишком высокая.",
    koreanText: "가격이 너무 높습니다.",
  },
];

const chat: NotesChatMessage[] = [
  {
    sentAt: "2026-05-09T01:01:00.000Z",
    senderName: "Host",
    senderCompany: "EVAS",
    role: "host",
    body: "This chat-only sentence must not affect summary.",
  },
];

describe("meeting notes markdown", () => {
  it("builds model input from transcript only and excludes chat", () => {
    const prompt = buildNotesModelPrompt(transcript);

    expect(buildNotesModelInput(transcript)).toContain("Original: Цена слишком высокая.");
    expect(prompt).toContain("Use ONLY the transcript");
    expect(prompt).not.toContain(chat[0].body);
  });

  it("parses fenced JSON model summaries", () => {
    expect(
      parseNotesModelSummary(
        '```json\n{"summaryKo":"요약","discussionTopics":["가격"],"decisions":["재검토"],"actionItems":[{"owner":"Kim","task":"견적 수정","due":"TBD","status":"open"}],"openQuestions":["납기는?"]}\n```',
      ),
    ).toEqual({
      summaryKo: "요약",
      discussionTopics: ["가격"],
      decisions: ["재검토"],
      actionItems: [{ owner: "Kim", task: "견적 수정", due: "TBD", status: "open" }],
      openQuestions: ["납기는?"],
    });
  });

  it("includes required sections, separate chat log, and original/Korean transcript", () => {
    const markdown = buildMeetingNotesMarkdown({
      meeting: {
        id: "meeting-1",
        title: "Buyer call",
        buyerCompany: "BuyerCo",
        memo: null,
        scheduledStartAt: "2026-05-09T01:00:00.000Z",
        startedAt: "2026-05-09T01:00:00.000Z",
        endedAt: "2026-05-09T02:00:00.000Z",
        hostName: "Kim",
        hostCompany: "EVAS",
      },
      generatedAt: "2026-05-09T02:05:00.000Z",
      summary: {
        summaryKo: "가격 이슈를 논의했습니다.",
        discussionTopics: ["가격"],
        decisions: ["견적 재검토"],
        actionItems: [{ owner: "Kim", task: "견적 수정", due: "TBD", status: "open" }],
        openQuestions: ["납기 확인 필요"],
      },
      transcriptSegments: transcript,
      chatMessages: chat,
    });

    expect(markdown).toContain("## Meeting Info");
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Discussion Topics");
    expect(markdown).toContain("## Decisions");
    expect(markdown).toContain("## Action Items");
    expect(markdown).toContain("## Open Questions");
    expect(markdown).toContain("## Chat Log");
    expect(markdown).toContain("## Original / Korean Translation Transcript");
    expect(markdown).toContain("Chat messages are retained as a separate log");
    expect(markdown).toContain("This chat-only sentence must not affect summary.");
    expect(markdown).toContain("Original: Цена слишком высокая.");
    expect(markdown).toContain("Korean: 가격이 너무 높습니다.");
  });
});
