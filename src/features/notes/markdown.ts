import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "@/lib/languages";

export type NotesMeetingInfo = {
  id: string;
  title: string;
  buyerCompany: string;
  memo: string | null;
  scheduledStartAt: string;
  startedAt: string | null;
  endedAt: string | null;
  hostName: string;
  hostCompany: string;
};

export type NotesTranscriptSegment = {
  sequence: number;
  startedAt: string;
  endedAt: string | null;
  speakerName: string;
  speakerCompany: string;
  sourceLanguage: SupportedLanguageCode;
  sourceText: string;
  koreanText: string;
};

export type NotesChatMessage = {
  sentAt: string;
  senderName: string;
  senderCompany: string;
  role: string;
  body: string;
};

export type NotesActionItem = {
  owner: string;
  task: string;
  due: string;
  status: string;
};

export type NotesModelSummary = {
  summaryKo: string;
  discussionTopics: string[];
  decisions: string[];
  actionItems: NotesActionItem[];
  openQuestions: string[];
};

export type MeetingNotesMarkdownInput = {
  meeting: NotesMeetingInfo;
  generatedAt: string;
  summary: NotesModelSummary;
  transcriptSegments: NotesTranscriptSegment[];
  chatMessages: NotesChatMessage[];
};

const EMPTY_SUMMARY: NotesModelSummary = {
  summaryKo: "기록된 원문/한국어 번역 transcript가 없어 자동 요약을 생성하지 않았습니다.",
  discussionTopics: [],
  decisions: [],
  actionItems: [],
  openQuestions: [],
};

const LANGUAGE_LABELS = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((language) => [language.code, language.label]),
) as Record<SupportedLanguageCode, string>;

export function createEmptyNotesSummary(): NotesModelSummary {
  return { ...EMPTY_SUMMARY, discussionTopics: [], decisions: [], actionItems: [], openQuestions: [] };
}

export function buildNotesModelInput(transcriptSegments: NotesTranscriptSegment[]) {
  return transcriptSegments
    .map((segment) => {
      const time = formatKst(segment.startedAt);
      const language = LANGUAGE_LABELS[segment.sourceLanguage] ?? segment.sourceLanguage;

      return [
        `#${segment.sequence} ${time} ${segment.speakerName} (${segment.speakerCompany}) [${language}]`,
        `Original: ${segment.sourceText}`,
        `Korean: ${segment.koreanText}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildNotesModelPrompt(transcriptSegments: NotesTranscriptSegment[]) {
  const transcript = buildNotesModelInput(transcriptSegments);

  return `You are creating Korean internal meeting notes for EVAS.
Use ONLY the transcript below for summary, topics, decisions, action items, and open questions.
Do not infer facts that are not present. Do not use meeting chat.
Return ONLY valid JSON with this exact shape:
{
  "summaryKo": "Korean paragraph summary",
  "discussionTopics": ["Korean bullet"],
  "decisions": ["Korean decision"],
  "actionItems": [{"owner":"name or TBD","task":"Korean task","due":"date or TBD","status":"open"}],
  "openQuestions": ["Korean question"]
}

Transcript:
${transcript || "No final transcript segments were recorded."}`;
}

export function parseNotesModelSummary(rawText: string): NotesModelSummary {
  const jsonText = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonText) as Partial<NotesModelSummary>;

  return normalizeNotesSummary(parsed);
}

export function normalizeNotesSummary(value: Partial<NotesModelSummary>): NotesModelSummary {
  return {
    summaryKo: normalizeText(value.summaryKo) || EMPTY_SUMMARY.summaryKo,
    discussionTopics: normalizeStringArray(value.discussionTopics),
    decisions: normalizeStringArray(value.decisions),
    actionItems: normalizeActionItems(value.actionItems),
    openQuestions: normalizeStringArray(value.openQuestions),
  };
}

export function buildMeetingNotesMarkdown({
  meeting,
  generatedAt,
  summary,
  transcriptSegments,
  chatMessages,
}: MeetingNotesMarkdownInput) {
  return [
    `# ${meeting.title} — Meeting Notes`,
    "",
    "## Meeting Info",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Buyer company | ${escapeTableCell(meeting.buyerCompany)} |`,
    `| Host | ${escapeTableCell(`${meeting.hostName} (${meeting.hostCompany})`)} |`,
    `| Scheduled | ${escapeTableCell(formatKst(meeting.scheduledStartAt))} |`,
    `| Started | ${escapeTableCell(meeting.startedAt ? formatKst(meeting.startedAt) : "Not recorded")} |`,
    `| Ended | ${escapeTableCell(meeting.endedAt ? formatKst(meeting.endedAt) : "Not recorded")} |`,
    `| Generated | ${escapeTableCell(formatKst(generatedAt))} |`,
    `| Memo | ${escapeTableCell(meeting.memo?.trim() || "None")} |`,
    "",
    "## Summary",
    "",
    summary.summaryKo,
    "",
    "## Discussion Topics",
    "",
    formatBulletList(summary.discussionTopics),
    "",
    "## Decisions",
    "",
    formatBulletList(summary.decisions),
    "",
    "## Action Items",
    "",
    formatActionItems(summary.actionItems),
    "",
    "## Open Questions",
    "",
    formatBulletList(summary.openQuestions),
    "",
    "## Chat Log",
    "",
    "Chat messages are retained as a separate log and were not used for the summary, decisions, or action items.",
    "",
    formatChatLog(chatMessages),
    "",
    "## Original / Korean Translation Transcript",
    "",
    formatTranscript(transcriptSegments),
    "",
  ].join("\n");
}

function extractJsonObject(rawText: string) {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const candidate = fenced?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Notes model did not return a JSON object.");
  }

  return candidate.slice(start, end + 1);
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeText).filter(Boolean);
}

function normalizeActionItems(value: unknown): NotesActionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const task = normalizeText(record.task);

      if (!task) {
        return null;
      }

      return {
        owner: normalizeText(record.owner) || "TBD",
        task,
        due: normalizeText(record.due) || "TBD",
        status: normalizeText(record.status) || "open",
      };
    })
    .filter((item): item is NotesActionItem => item !== null);
}

function formatBulletList(items: string[]) {
  if (items.length === 0) {
    return "- None recorded.";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatActionItems(items: NotesActionItem[]) {
  if (items.length === 0) {
    return "| Owner | Action Item | Due | Status |\n| --- | --- | --- | --- |\n| TBD | None recorded. | TBD | closed |";
  }

  return [
    "| Owner | Action Item | Due | Status |",
    "| --- | --- | --- | --- |",
    ...items.map(
      (item) =>
        `| ${escapeTableCell(item.owner)} | ${escapeTableCell(item.task)} | ${escapeTableCell(item.due)} | ${escapeTableCell(item.status)} |`,
    ),
  ].join("\n");
}

function formatChatLog(messages: NotesChatMessage[]) {
  if (messages.length === 0) {
    return "- No chat messages recorded.";
  }

  return messages
    .map(
      (message) =>
        `- ${formatKst(message.sentAt)} — ${message.senderName} (${message.senderCompany}, ${message.role}): ${message.body}`,
    )
    .join("\n");
}

function formatTranscript(segments: NotesTranscriptSegment[]) {
  if (segments.length === 0) {
    return "No final transcript segments recorded.";
  }

  return segments
    .map((segment) => {
      const language = LANGUAGE_LABELS[segment.sourceLanguage] ?? segment.sourceLanguage;

      return [
        `### ${segment.sequence}. ${formatKst(segment.startedAt)} — ${segment.speakerName} (${segment.speakerCompany})`,
        "",
        `- Source language: ${language}`,
        `- Original: ${segment.sourceText}`,
        `- Korean: ${segment.koreanText}`,
      ].join("\n");
    })
    .join("\n\n");
}

function escapeTableCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br />");
}

function formatKst(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
