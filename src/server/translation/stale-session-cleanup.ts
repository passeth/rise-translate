import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { BROWSER_TRANSLATION_WORKER_ID } from "@/server/translation/session-ownership";

export type StaleTranslationSessionCleanupSummary = {
  cutoff: string;
  stopped: number;
};

export function getStaleTranslationSessionCutoff({
  now = Date.now(),
  maxAgeMs = 30 * 60 * 1000,
}: {
  now?: number;
  maxAgeMs?: number;
} = {}) {
  return new Date(now - maxAgeMs).toISOString();
}

export function buildStaleTranslationSessionCleanupOwnershipFilter() {
  return [`worker_id.neq.${BROWSER_TRANSLATION_WORKER_ID}`, "worker_id.is.null"].join(",");
}

export async function stopStaleStartingTranslationSessions({
  cutoff = getStaleTranslationSessionCutoff(),
}: {
  cutoff?: string;
} = {}): Promise<StaleTranslationSessionCleanupSummary> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("rt_translation_sessions")
    .update({
      status: "failed",
      last_error: "Translation session expired before a live worker could attach.",
      stopped_at: now,
      updated_at: now,
    })
    .in("status", ["starting", "reconnecting"])
    .or(buildStaleTranslationSessionCleanupOwnershipFilter())
    .lt("updated_at", cutoff)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  return {
    cutoff,
    stopped: data?.length ?? 0,
  };
}
