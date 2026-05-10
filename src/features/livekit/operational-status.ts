export type CaptionConnectionStatus = "connected" | "reconnecting" | "delayed" | "unavailable";

export type TranslationSessionStatus = {
  status: string;
  updated_at: string;
  worker_heartbeat_at?: string | null;
  source_identity?: string | null;
  target_language?: string | null;
};

export function resolveCaptionConnectionStatus({
  fetchOk,
  previousStatus,
  captionCount,
  newestCaptionAt,
  now = Date.now(),
  delayedAfterMs = 30_000,
}: {
  fetchOk: boolean;
  previousStatus: CaptionConnectionStatus;
  captionCount: number;
  newestCaptionAt?: string | null;
  now?: number;
  delayedAfterMs?: number;
}): CaptionConnectionStatus {
  if (!fetchOk) {
    return previousStatus === "connected" || previousStatus === "delayed" ? "reconnecting" : "unavailable";
  }

  if (captionCount === 0) {
    return "delayed";
  }

  if (newestCaptionAt) {
    const newestMs = new Date(newestCaptionAt).getTime();
    if (Number.isFinite(newestMs) && now - newestMs > delayedAfterMs) {
      return "delayed";
    }
  }

  return "connected";
}

export type CaptionSegmentStatus = {
  started_at: string;
};

export function summarizeCaptionStatus(
  segments: CaptionSegmentStatus[],
  { now = Date.now(), delayedAfterMs = 30_000 }: { now?: number; delayedAfterMs?: number } = {},
) {
  const latest = segments
    .map((segment) => new Date(segment.started_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  if (!latest) {
    return { status: "waiting", message: "Waiting for speech transcripts." };
  }

  if (now - latest > delayedAfterMs) {
    return { status: "delayed", message: "No recent captions have arrived." };
  }

  return { status: "connected", message: "Captions are receiving transcript segments." };
}

export function summarizeTranslationStatus(
  sessions: TranslationSessionStatus[],
  { now = Date.now(), delayedAfterMs = 30_000 }: { now?: number; delayedAfterMs?: number } = {},
) {
  const latestSessions = getLatestTranslationSessionsByLane(sessions);

  if (latestSessions.length === 0) {
    return { status: "stopped", message: "No active translation channels." };
  }

  const connectedSessions = latestSessions.filter((session) => session.status === "connected");
  const freshConnectedSessions = connectedSessions.filter(
    (session) => !isTranslationSessionDelayed(session.worker_heartbeat_at ?? session.updated_at, now, delayedAfterMs),
  );

  if (freshConnectedSessions.length > 0) {
    return { status: "connected", message: "Translation audio is connected." };
  }

  if (connectedSessions.length > 0) {
    return { status: "delayed", message: "Translation channel heartbeat is delayed." };
  }

  if (latestSessions.some((session) => session.status === "reconnecting")) {
    return { status: "reconnecting", message: "A translation channel is reconnecting." };
  }

  if (latestSessions.some((session) => session.status === "starting" && isTranslationSessionDelayed(session.updated_at, now, delayedAfterMs))) {
    return { status: "delayed", message: "A translation channel is delayed." };
  }

  if (latestSessions.some((session) => session.status === "starting")) {
    return { status: "starting", message: "Translation is starting." };
  }

  if (latestSessions.some((session) => session.status === "failed")) {
    return { status: "failed", message: "A translation channel failed." };
  }

  return { status: "stopped", message: "No active translation channels." };
}

function getLatestTranslationSessionsByLane(sessions: TranslationSessionStatus[]) {
  const byLane = new Map<string, TranslationSessionStatus>();

  for (const session of sessions) {
    const laneKey = `${session.source_identity ?? "unknown"}:${session.target_language ?? "unknown"}`;
    const current = byLane.get(laneKey);
    if (!current || getTime(session.updated_at) >= getTime(current.updated_at)) {
      byLane.set(laneKey, session);
    }
  }

  return [...byLane.values()].filter((session) => session.status !== "stopped");
}

function isTranslationSessionDelayed(updatedAt: string, now: number, delayedAfterMs: number) {
  const updatedMs = getTime(updatedAt);
  return Number.isFinite(updatedMs) && now - updatedMs > delayedAfterMs;
}

function getTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function getOperationalStatusTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (["connected", "active", "complete", "available", "processing", "generating"].includes(status)) return "ok";
  if (["starting", "reconnecting", "delayed"].includes(status)) return "warn";
  if (["failed", "unavailable"].includes(status)) return "danger";
  return "muted";
}
