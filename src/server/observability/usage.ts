import { logOperationalEvent } from "@/server/observability/events";

export type UsageSnapshotReason =
  | "participant_join"
  | "participant_leave"
  | "meeting_end"
  | "auto_end"
  | "translation_start"
  | "translation_update"
  | "translation_stop"
  | "recording_expiry"
  | "manual";

export type UsageMeetingRow = {
  id: string;
  livekit_room_name: string;
  scheduled_start_at?: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type UsageParticipantRow = {
  status: string;
};

export type UsageRecordingRow = {
  status: string;
  started_at: string | null;
  stopped_at: string | null;
  available_at?: string | null;
  deleted_at?: string | null;
};

export type UsageTranslationSessionRow = {
  status: string;
  source_language: string;
  target_language: string;
  connected_at?: string | null;
  stopped_at?: string | null;
};

export type UsageSnapshotBuildInput = {
  meeting: UsageMeetingRow;
  participants: UsageParticipantRow[];
  recordings: UsageRecordingRow[];
  translationSessions: UsageTranslationSessionRow[];
  reason: UsageSnapshotReason;
  capturedAt: string;
  metadata?: Record<string, unknown>;
};

type SelectBuilder<T> = {
  select: (columns: string) => SelectBuilder<T>;
  eq: (column: string, value: string) => SelectBuilder<T>;
  maybeSingle?: () => PromiseLike<{ data: T | null; error: { message?: string } | null }>;
  returns?: <R>() => PromiseLike<{ data: R | null; error: { message?: string } | null }>;
  insert?: (row: Record<string, unknown>) => PromiseLike<{ error?: { message?: string } | null }>;
};

export type UsageSupabaseClient = {
  from: (table: string) => SelectBuilder<unknown>;
};

export function secondsBetween(start: string | null | undefined, end: string): number {
  if (!start) return 0;
  const startedMs = new Date(start).getTime();
  const endedMs = new Date(end).getTime();

  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) {
    return 0;
  }

  return Math.floor((endedMs - startedMs) / 1000);
}

export function buildTranslationChannelActivity(sessions: UsageTranslationSessionRow[]) {
  const byStatus: Record<string, number> = {};
  const byTargetLanguage: Record<string, number> = {};
  const bySourceTarget: Record<string, number> = {};

  for (const session of sessions) {
    byStatus[session.status] = (byStatus[session.status] ?? 0) + 1;
    byTargetLanguage[session.target_language] = (byTargetLanguage[session.target_language] ?? 0) + 1;
    const pair = `${session.source_language}->${session.target_language}`;
    bySourceTarget[pair] = (bySourceTarget[pair] ?? 0) + 1;
  }

  return { byStatus, byTargetLanguage, bySourceTarget };
}

export function buildUsageSnapshotPayload(input: UsageSnapshotBuildInput) {
  const activeParticipantCount = input.participants.filter((participant) =>
    ["joining", "active"].includes(participant.status),
  ).length;
  const recordingDurationSeconds = input.recordings.reduce(
    (sum, recording) => sum + secondsBetween(recording.started_at, recording.stopped_at ?? input.capturedAt),
    0,
  );
  const translationConnectedCount = input.translationSessions.filter(
    (session) => session.status === "connected",
  ).length;
  const translationFailedCount = input.translationSessions.filter((session) => session.status === "failed").length;

  return {
    meeting_id: input.meeting.id,
    room_name: input.meeting.livekit_room_name,
    captured_at: input.capturedAt,
    reason: input.reason,
    meeting_duration_seconds: secondsBetween(
      input.meeting.started_at ?? input.meeting.scheduled_start_at,
      input.meeting.ended_at ?? input.capturedAt,
    ),
    active_participant_count: activeParticipantCount,
    total_participant_count: input.participants.length,
    recording_duration_seconds: recordingDurationSeconds,
    translation_session_count: input.translationSessions.length,
    translation_connected_count: translationConnectedCount,
    translation_failed_count: translationFailedCount,
    translation_channel_activity: buildTranslationChannelActivity(input.translationSessions),
    metadata: input.metadata ?? {},
  };
}

export async function recordUsageSnapshot({
  supabase,
  meetingId,
  reason,
  metadata,
  capturedAt = new Date().toISOString(),
}: {
  supabase: unknown;
  meetingId: string;
  reason: UsageSnapshotReason;
  metadata?: Record<string, unknown>;
  capturedAt?: string;
}): Promise<void> {
  const db = supabase as UsageSupabaseClient;
  try {
    const meetingResult = await db
      .from("rt_meetings")
      .select("id, livekit_room_name, scheduled_start_at, started_at, ended_at")
      .eq("id", meetingId)
      .maybeSingle?.();

    if (!meetingResult?.data || meetingResult.error) {
      await logOperationalEvent({
        supabase: supabase as never,
        meetingId,
        featureArea: "meeting",
        eventType: "usage_snapshot_failed",
        severity: "warning",
        errorType: "meeting_lookup_failed",
        message: meetingResult?.error?.message ?? "Meeting not found for usage snapshot.",
      });
      return;
    }

    const [participantsResult, recordingsResult, translationResult] = await Promise.all([
      db
        .from("rt_meeting_participants")
        .select("status")
        .eq("meeting_id", meetingId)
        .returns?.<UsageParticipantRow[]>(),
      db
        .from("rt_recordings")
        .select("status, started_at, stopped_at, available_at, deleted_at")
        .eq("meeting_id", meetingId)
        .returns?.<UsageRecordingRow[]>(),
      db
        .from("rt_translation_sessions")
        .select("status, source_language, target_language, connected_at, stopped_at")
        .eq("meeting_id", meetingId)
        .returns?.<UsageTranslationSessionRow[]>(),
    ]);

    const payload = buildUsageSnapshotPayload({
      meeting: meetingResult.data as UsageMeetingRow,
      participants: participantsResult?.data ?? [],
      recordings: recordingsResult?.data ?? [],
      translationSessions: translationResult?.data ?? [],
      reason,
      capturedAt,
      metadata,
    });

    const insertResult = await db.from("rt_usage_snapshots").insert?.(payload);

    if (insertResult?.error) {
      await logOperationalEvent({
        supabase: supabase as never,
        meetingId,
        roomName: payload.room_name,
        featureArea: "meeting",
        eventType: "usage_snapshot_failed",
        severity: "warning",
        errorType: "supabase_error",
        message: insertResult.error.message ?? "Unable to persist usage snapshot.",
        metadata: { reason },
      });
    }
  } catch (error) {
    await logOperationalEvent({
      supabase: supabase as never,
      meetingId,
      featureArea: "meeting",
      eventType: "usage_snapshot_failed",
      severity: "warning",
      errorType: error instanceof Error ? error.name : "unknown_error",
      message: error instanceof Error ? error.message : "Unable to persist usage snapshot.",
      metadata: { reason },
    });
  }
}
