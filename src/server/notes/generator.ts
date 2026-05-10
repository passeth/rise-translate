import OpenAI from "openai";
import { getServerEnv, requireEnv } from "@/lib/env";
import { isSupportedLanguage } from "@/lib/languages";
import {
  buildMeetingNotesMarkdown,
  buildNotesModelPrompt,
  createEmptyNotesSummary,
  normalizeNotesSummary,
  parseNotesModelSummary,
  type NotesChatMessage,
  type NotesMeetingInfo,
  type NotesModelSummary,
  type NotesTranscriptSegment,
} from "@/features/notes/markdown";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

type GenerateMeetingNotesOptions = {
  retry?: boolean;
  openai?: Pick<OpenAI, "responses">;
};

type MeetingRow = {
  id: string;
  host_id: string;
  title: string;
  scheduled_start_at: string;
  buyer_company: string;
  memo: string | null;
  started_at: string | null;
  ended_at: string | null;
};

type HostProfileRow = {
  display_name: string;
  company: string;
};

type ExistingNotesRow = {
  retry_count: number;
};

type TranscriptRow = {
  sequence: number;
  started_at: string;
  ended_at: string | null;
  source_language: string;
  source_text: string;
  korean_text: string;
  rt_meeting_participants: {
    display_name: string;
    company: string;
  } | null;
};

type ChatMessageRow = {
  sent_at: string;
  body: string;
  rt_meeting_participants: {
    display_name: string;
    company: string;
    role: string;
  } | null;
};

export type GenerateMeetingNotesResult = {
  status: "complete";
  markdown: string;
};

export async function generateMeetingNotesForMeeting(
  meetingId: string,
  options: GenerateMeetingNotesOptions = {},
): Promise<GenerateMeetingNotesResult> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  await markNotesGenerating(meetingId, options.retry ?? false, now);

  try {
    const meeting = await loadMeetingInfo(meetingId);
    const [transcriptSegments, chatMessages] = await Promise.all([
      loadTranscriptSegments(meetingId),
      loadChatMessages(meetingId),
    ]);
    const summary = await summarizeTranscript(transcriptSegments, options.openai);
    const generatedAt = new Date().toISOString();
    const markdown = buildMeetingNotesMarkdown({
      meeting,
      generatedAt,
      summary,
      transcriptSegments,
      chatMessages,
    });

    await admin.from("rt_meeting_notes").upsert({
      meeting_id: meetingId,
      status: "complete",
      markdown,
      summary_ko: summary.summaryKo,
      decisions: summary.decisions,
      action_items: summary.actionItems,
      open_questions: summary.openQuestions,
      generated_at: generatedAt,
      failed_reason: null,
      updated_at: generatedAt,
    });

    await admin
      .from("rt_meetings")
      .update({ notes_status: "complete", updated_at: generatedAt })
      .eq("id", meetingId);

    return { status: "complete", markdown };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown notes generation error.";

    await admin.from("rt_meeting_notes").upsert({
      meeting_id: meetingId,
      status: "failed",
      failed_reason: message,
      updated_at: failedAt,
    });

    await admin
      .from("rt_meetings")
      .update({ notes_status: "failed", updated_at: failedAt })
      .eq("id", meetingId);

    throw error;
  }
}

export function getMarkdownFilename(title: string, generatedAt?: string | null) {
  const date = generatedAt ? generatedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${date}-${slug || "meeting-notes"}.md`;
}

async function markNotesGenerating(meetingId: string, retry: boolean, now: string) {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("rt_meeting_notes")
    .select("retry_count")
    .eq("meeting_id", meetingId)
    .maybeSingle<ExistingNotesRow>();

  await admin.from("rt_meeting_notes").upsert({
    meeting_id: meetingId,
    status: "generating",
    failed_reason: null,
    retry_count: retry ? (existing?.retry_count ?? 0) + 1 : (existing?.retry_count ?? 0),
    updated_at: now,
  });

  await admin
    .from("rt_meetings")
    .update({ notes_status: "generating", updated_at: now })
    .eq("id", meetingId);
}

async function loadMeetingInfo(meetingId: string): Promise<NotesMeetingInfo> {
  const admin = createSupabaseAdminClient();
  const { data: meeting, error } = await admin
    .from("rt_meetings")
    .select("id, host_id, title, scheduled_start_at, buyer_company, memo, started_at, ended_at")
    .eq("id", meetingId)
    .maybeSingle<MeetingRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!meeting) {
    throw new Error("Meeting not found.");
  }

  const { data: host } = await admin
    .from("rt_host_profiles")
    .select("display_name, company")
    .eq("id", meeting.host_id)
    .maybeSingle<HostProfileRow>();

  return {
    id: meeting.id,
    title: meeting.title,
    buyerCompany: meeting.buyer_company,
    memo: meeting.memo,
    scheduledStartAt: meeting.scheduled_start_at,
    startedAt: meeting.started_at,
    endedAt: meeting.ended_at,
    hostName: host?.display_name ?? "EVAS Host",
    hostCompany: host?.company ?? "EVAS",
  };
}

async function loadTranscriptSegments(meetingId: string): Promise<NotesTranscriptSegment[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("rt_transcript_segments")
    .select(
      "sequence, started_at, ended_at, source_language, source_text, korean_text, rt_meeting_participants(display_name, company)",
    )
    .eq("meeting_id", meetingId)
    .eq("is_final", true)
    .order("sequence", { ascending: true })
    .returns<TranscriptRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((segment) => ({
    sequence: Number(segment.sequence),
    startedAt: segment.started_at,
    endedAt: segment.ended_at,
    speakerName: segment.rt_meeting_participants?.display_name ?? "Unknown speaker",
    speakerCompany: segment.rt_meeting_participants?.company ?? "",
    sourceLanguage: isSupportedLanguage(segment.source_language) ? segment.source_language : "ko",
    sourceText: segment.source_text,
    koreanText: segment.korean_text,
  }));
}

async function loadChatMessages(meetingId: string): Promise<NotesChatMessage[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("rt_chat_messages")
    .select("sent_at, body, rt_meeting_participants(display_name, company, role)")
    .eq("meeting_id", meetingId)
    .order("sent_at", { ascending: true })
    .returns<ChatMessageRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((message) => ({
    sentAt: message.sent_at,
    senderName: message.rt_meeting_participants?.display_name ?? "Unknown",
    senderCompany: message.rt_meeting_participants?.company ?? "",
    role: message.rt_meeting_participants?.role ?? "guest",
    body: message.body,
  }));
}

export async function summarizeTranscript(
  transcriptSegments: NotesTranscriptSegment[],
  injectedOpenAI?: Pick<OpenAI, "responses">,
): Promise<NotesModelSummary> {
  if (transcriptSegments.length === 0) {
    return createEmptyNotesSummary();
  }

  const env = getServerEnv();
  const model = env.OPENAI_NOTES_MODEL?.trim() || "gpt-4.1-mini";
  const openai = injectedOpenAI ?? new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  try {
    const response = await openai.responses.create({
      model,
      input: buildNotesModelPrompt(transcriptSegments),
      max_output_tokens: 2400,
    });

    const outputText = typeof response.output_text === "string" ? response.output_text : "";

    try {
      return parseNotesModelSummary(outputText);
    } catch {
      return normalizeNotesSummary({ summaryKo: outputText });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown notes model error.";
    return normalizeNotesSummary({
      summaryKo: `자동 요약 생성 중 오류가 발생해 원문/한국어 transcript만 보존했습니다. 오류: ${message}`,
      openQuestions: ["자동 요약을 다시 생성해야 합니다."],
    });
  }
}
