import {
  BROWSER_TRANSLATION_WORKER_ID,
  PENDING_SERVER_TRANSLATION_WORKER_ID,
} from "@/server/translation/session-ownership";

export const DEFAULT_TRANSLATION_WORKER_CLAIM_TIMEOUT_MS = 60_000;

export function getTranslationWorkerClaimStaleBefore({
  now = Date.now(),
  timeoutMs = DEFAULT_TRANSLATION_WORKER_CLAIM_TIMEOUT_MS,
}: {
  now?: number;
  timeoutMs?: number;
} = {}) {
  return new Date(now - Math.max(1, timeoutMs)).toISOString();
}

export function buildTranslationWorkerClaimFilter(staleBeforeIso: string) {
  return [
    `worker_id.eq.${PENDING_SERVER_TRANSLATION_WORKER_ID}`,
    `and(worker_id.neq.${BROWSER_TRANSLATION_WORKER_ID},worker_heartbeat_at.lt.${staleBeforeIso})`,
    "and(worker_id.is.null,worker_heartbeat_at.is.null)",
  ].join(",");
}
