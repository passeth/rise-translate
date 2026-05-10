import { getTranslationTrackName } from "@/features/translation/config";
import { getServerEnv } from "@/lib/env";
import type { SupportedLanguageCode } from "@/lib/languages";
import { buildRealtimeTranslationSessionConfig } from "@/server/translation/realtime";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { logOperationalEvent } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { assertServerTranslationReady } from "@/server/translation/readiness";
import {
  BROWSER_TRANSLATION_WORKER_ID,
  PENDING_SERVER_TRANSLATION_WORKER_ID,
} from "@/server/translation/session-ownership";

export type ExistingTranslationSessionRow = {
  id: string;
  target_track_name: string;
  status: string;
  updated_at: string;
  worker_id: string | null;
};

const ACTIVE_TRANSLATION_STATUSES = ["starting", "connected", "reconnecting"] as const;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SupabaseMutationError = {
  code?: string;
  message?: string;
};

export type StartTranslationRouterInput = {
  meetingId: string;
  livekitRoomName: string;
  sourceParticipantId: string;
  sourceIdentity: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
};

export async function startTranslationRouterForParticipant(input: StartTranslationRouterInput) {
  if (input.sourceLanguage === input.targetLanguage) {
    throw new Error("Translation source and target languages must be different.");
  }

  assertServerTranslationReady({ allowDryRun: false });

  const admin = createSupabaseAdminClient();
  const env = getServerEnv();
  const targetTrackName = getTranslationTrackName(input.targetLanguage);
  const realtimeConfig = buildRealtimeTranslationSessionConfig({
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
  });

  const { data: existingSessions, error: existingError } = await admin
    .from("rt_translation_sessions")
    .select("id, target_track_name, status, updated_at, worker_id")
    .eq("meeting_id", input.meetingId)
    .eq("source_identity", input.sourceIdentity)
    .eq("target_language", input.targetLanguage)
    .in("status", [...ACTIVE_TRANSLATION_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(10)
    .returns<ExistingTranslationSessionRow[]>();

  if (existingError) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: input.meetingId,
      roomName: input.livekitRoomName,
      featureArea: "translation",
      eventType: "translation_session_lookup_failed",
      severity: "error",
      errorType: "supabase_error",
      message: existingError.message,
      metadata: { sourceIdentity: input.sourceIdentity, targetLanguage: input.targetLanguage },
    });
    throw new Error(existingError.message);
  }

  const existingBrowserSessionIds = getBrowserFallbackSessionIds(existingSessions ?? []);
  const existingSession = selectReusableServerSession(existingSessions ?? []);
  if (existingSession) {
    await stopBrowserFallbackSessions({
      admin,
      input,
      sessionIds: existingBrowserSessionIds,
      reason: "translation_browser_fallback_stopped_for_server_reuse",
    });

    await logOperationalEvent({
      supabase: admin,
      meetingId: input.meetingId,
      roomName: input.livekitRoomName,
      featureArea: "translation",
      eventType: "translation_session_reused",
      message: "Existing active translation session was reused instead of creating a duplicate.",
      metadata: {
        sessionId: existingSession.id,
        sourceIdentity: input.sourceIdentity,
        targetLanguage: input.targetLanguage,
        status: existingSession.status,
      },
    });

    return {
      sessionId: existingSession.id,
      targetLanguage: input.targetLanguage,
      targetTrackName: existingSession.target_track_name,
      realtimeConfig,
    };
  }

  await stopBrowserFallbackSessions({
    admin,
    input,
    sessionIds: existingBrowserSessionIds,
    reason: "translation_browser_fallback_stopped_for_server_start",
  });

  const { data, error } = await insertPendingServerTranslationSession({
    admin,
    input,
    targetTrackName,
    openaiModel: env.OPENAI_TRANSLATION_MODEL,
  });

  if (error) {
    let insertError = error;

    if (isTranslationLaneUniqueConflict(error)) {
      const { data: racedSessions } = await admin
        .from("rt_translation_sessions")
        .select("id, target_track_name, status, updated_at, worker_id")
        .eq("meeting_id", input.meetingId)
        .eq("source_identity", input.sourceIdentity)
        .eq("target_language", input.targetLanguage)
        .in("status", [...ACTIVE_TRANSLATION_STATUSES])
        .order("updated_at", { ascending: false })
        .limit(10)
        .returns<ExistingTranslationSessionRow[]>();

      const racedSession = selectReusableServerSession(racedSessions ?? []);
      if (racedSession) {
        await logOperationalEvent({
          supabase: admin,
          meetingId: input.meetingId,
          roomName: input.livekitRoomName,
          featureArea: "translation",
          eventType: "translation_session_reused_after_race",
          message: "Concurrent translation start reused the active lane after a unique constraint conflict.",
          metadata: {
            sessionId: racedSession.id,
            sourceIdentity: input.sourceIdentity,
            targetLanguage: input.targetLanguage,
            status: racedSession.status,
          },
        });

        return {
          sessionId: racedSession.id,
          targetLanguage: input.targetLanguage,
          targetTrackName: racedSession.target_track_name,
          realtimeConfig,
        };
      }

      const racedBrowserSessionIds = getBrowserFallbackSessionIds(racedSessions ?? []);
      if (racedBrowserSessionIds.length > 0) {
        await stopBrowserFallbackSessions({
          admin,
          input,
          sessionIds: racedBrowserSessionIds,
          reason: "translation_browser_fallback_stopped_after_server_race",
        });

        const retry = await insertPendingServerTranslationSession({
          admin,
          input,
          targetTrackName,
          openaiModel: env.OPENAI_TRANSLATION_MODEL,
        });

        if (retry.error) {
          insertError = retry.error;
        }

        if (!retry.error && retry.data) {
          await logOperationalEvent({
            supabase: admin,
            meetingId: input.meetingId,
            roomName: input.livekitRoomName,
            featureArea: "translation",
            eventType: "translation_session_created_after_browser_fallback_race",
            message: "Server translation session record created after stopping a browser fallback lane.",
            metadata: {
              sessionId: retry.data.id,
              sourceIdentity: input.sourceIdentity,
              targetLanguage: input.targetLanguage,
            },
          });

          return {
            sessionId: retry.data.id,
            targetLanguage: input.targetLanguage,
            targetTrackName,
            realtimeConfig,
          };
        }
      }
    }

    await logOperationalEvent({
      supabase: admin,
      meetingId: input.meetingId,
      roomName: input.livekitRoomName,
      featureArea: "translation",
      eventType: "translation_session_insert_failed",
      severity: "error",
      errorType: "supabase_error",
      message: insertError.message,
      metadata: { sourceIdentity: input.sourceIdentity, targetLanguage: input.targetLanguage },
    });
    throw new Error(insertError.message);
  }

  await logOperationalEvent({
    supabase: admin,
    meetingId: input.meetingId,
    roomName: input.livekitRoomName,
    featureArea: "translation",
    eventType: "translation_session_created",
    message: "Translation session record created.",
    metadata: { sessionId: data.id, sourceIdentity: input.sourceIdentity, targetLanguage: input.targetLanguage },
  });

  return {
    sessionId: data.id,
    targetLanguage: input.targetLanguage,
    targetTrackName,
    realtimeConfig,
  };
}

export async function stopTranslationRouterForMeeting(meetingId: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("livekit_room_name")
    .eq("id", meetingId)
    .maybeSingle<{ livekit_room_name: string }>();

  const { error } = await admin
    .from("rt_translation_sessions")
    .update({ status: "stopped", stopped_at: now, updated_at: now })
    .eq("meeting_id", meetingId)
    .in("status", [...ACTIVE_TRANSLATION_STATUSES, "failed"]);

  if (error) {
    await logOperationalEvent({
      supabase: admin,
      meetingId,
      roomName: meeting?.livekit_room_name,
      featureArea: "translation",
      eventType: "translation_shutdown_failed",
      severity: "error",
      errorType: "supabase_error",
      message: error.message,
    });
    throw new Error(error.message);
  }

  await logOperationalEvent({
    supabase: admin,
    meetingId,
    roomName: meeting?.livekit_room_name,
    featureArea: "cleanup",
    eventType: "translation_shutdown",
    message: "Translation sessions were marked stopped.",
  });
  await recordUsageSnapshot({ supabase: admin, meetingId, reason: "translation_stop" });
}

function insertPendingServerTranslationSession(input: {
  admin: SupabaseAdminClient;
  input: StartTranslationRouterInput;
  targetTrackName: string;
  openaiModel: string;
}) {
  return input.admin
    .from("rt_translation_sessions")
    .insert({
      meeting_id: input.input.meetingId,
      source_participant_id: input.input.sourceParticipantId,
      source_identity: input.input.sourceIdentity,
      source_language: input.input.sourceLanguage,
      target_language: input.input.targetLanguage,
      target_track_name: input.targetTrackName,
      status: "starting",
      openai_model: input.openaiModel,
      livekit_room_name: input.input.livekitRoomName,
      worker_id: PENDING_SERVER_TRANSLATION_WORKER_ID,
    })
    .select("id")
    .single<{ id: string }>();
}

async function stopBrowserFallbackSessions(input: {
  admin: SupabaseAdminClient;
  input: StartTranslationRouterInput;
  sessionIds: string[];
  reason: string;
}) {
  if (input.sessionIds.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await input.admin
    .from("rt_translation_sessions")
    .update({ status: "stopped", stopped_at: now, updated_at: now })
    .in("id", input.sessionIds);

  if (error) {
    await logOperationalEvent({
      supabase: input.admin,
      meetingId: input.input.meetingId,
      roomName: input.input.livekitRoomName,
      featureArea: "translation",
      eventType: "translation_browser_fallback_stop_failed",
      severity: "error",
      errorType: "supabase_error",
      message: error.message,
      metadata: {
        sourceIdentity: input.input.sourceIdentity,
        targetLanguage: input.input.targetLanguage,
        sessionIds: input.sessionIds,
      },
    });
    throw new Error(error.message);
  }

  await logOperationalEvent({
    supabase: input.admin,
    meetingId: input.input.meetingId,
    roomName: input.input.livekitRoomName,
    featureArea: "translation",
    eventType: input.reason,
    message: "Browser fallback translation session was stopped before starting server interpretation.",
    metadata: {
      sourceIdentity: input.input.sourceIdentity,
      targetLanguage: input.input.targetLanguage,
      sessionIds: input.sessionIds,
    },
  });
}

export function selectReusableServerSession(sessions: ExistingTranslationSessionRow[]) {
  return sessions.find((session) => !isBrowserFallbackTranslationSession(session)) ?? null;
}

export function getBrowserFallbackSessionIds(sessions: ExistingTranslationSessionRow[]) {
  return sessions.filter(isBrowserFallbackTranslationSession).map((session) => session.id);
}

export function isBrowserFallbackTranslationSession(session: Pick<ExistingTranslationSessionRow, "worker_id">) {
  return session.worker_id === BROWSER_TRANSLATION_WORKER_ID;
}

export function isTranslationLaneUniqueConflict(error: SupabaseMutationError | null | undefined) {
  return (
    error?.code === "23505" &&
    (error.message?.includes("rt_translation_sessions_one_active_lane_idx") ?? false)
  );
}
