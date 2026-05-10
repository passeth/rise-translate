import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { TranslationBridgeStartRequest } from "@/server/translation/bridge";
import { REALTIME_PCM_FORMAT } from "@/server/translation/audio-format";
import { buildTranslationWorkerClaimFilter, getTranslationWorkerClaimStaleBefore } from "@/server/translation/worker-claim";

export type TranslationSessionRecord = TranslationBridgeStartRequest & {
  status: "starting" | "connected" | "reconnecting" | "failed" | "stopped";
};

export interface TranslationSessionRepository {
  claimNext(workerId: string): Promise<TranslationSessionRecord | null>;
  updateStatus(
    sessionId: string,
    status: TranslationSessionRecord["status"],
    options?: { error?: string; heartbeat?: boolean },
  ): Promise<void>;
}

type TranslationSessionRow = {
  id: string;
  meeting_id: string;
  livekit_room_name: string;
  source_identity: string;
  source_language: TranslationSessionRecord["sourceLanguage"];
  target_language: TranslationSessionRecord["targetLanguage"];
  target_track_name: string;
  status: TranslationSessionRecord["status"];
};

export class SupabaseTranslationSessionRepository implements TranslationSessionRepository {
  private readonly claimTimeoutMs: number;

  constructor({ claimTimeoutMs }: { claimTimeoutMs?: number } = {}) {
    this.claimTimeoutMs = claimTimeoutMs ?? 60_000;
  }

  async claimNext(workerId: string): Promise<TranslationSessionRecord | null> {
    const admin = createSupabaseAdminClient();
    const staleBefore = getTranslationWorkerClaimStaleBefore({ timeoutMs: this.claimTimeoutMs });
    const claimableFilter = buildTranslationWorkerClaimFilter(staleBefore);
    const { data: row, error } = await admin
      .from("rt_translation_sessions")
      .select(
        "id, meeting_id, livekit_room_name, source_identity, source_language, target_language, target_track_name, status",
      )
      .in("status", ["starting", "reconnecting"])
      .or(claimableFilter)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<TranslationSessionRow>();

    if (error) {
      throw new Error(error.message);
    }

    if (!row) {
      return null;
    }

    const now = new Date().toISOString();
    const { data: claimedRows, error: updateError } = await admin
      .from("rt_translation_sessions")
      .update({
        worker_id: workerId,
        worker_claimed_at: now,
        worker_heartbeat_at: now,
        media_format: REALTIME_PCM_FORMAT,
        updated_at: now,
      })
      .eq("id", row.id)
      .in("status", ["starting", "reconnecting"])
      .or(claimableFilter)
      .select("id")
      .returns<Array<{ id: string }>>();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!claimedRows || claimedRows.length === 0) {
      return null;
    }

    return {
      sessionId: row.id,
      meetingId: row.meeting_id,
      livekitRoomName: row.livekit_room_name,
      sourceParticipantIdentity: row.source_identity,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      targetTrackName: row.target_track_name,
      status: row.status,
    };
  }

  async updateStatus(
    sessionId: string,
    status: TranslationSessionRecord["status"],
    options: { error?: string; heartbeat?: boolean } = {},
  ) {
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const patch: Record<string, string | null> = {
      status,
      last_error: options.error ?? null,
      updated_at: now,
    };

    if (status === "connected") {
      patch.connected_at = now;
    }

    if (status === "stopped") {
      patch.stopped_at = now;
    }

    if (options.heartbeat) {
      patch.worker_heartbeat_at = now;
    }

    const { error } = await admin.from("rt_translation_sessions").update(patch).eq("id", sessionId);

    if (error) {
      throw new Error(error.message);
    }
  }
}
