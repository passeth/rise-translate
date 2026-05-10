"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

type TranslationSession = {
  id: string;
  source_identity: string;
  source_language: string;
  target_language: string;
  target_track_name: string;
  status: string;
  last_error: string | null;
  updated_at: string;
  worker_heartbeat_at: string | null;
};

type TranslationParticipant = {
  id: string;
  display_name: string;
  company: string;
  role: string;
  livekit_identity: string;
  speaking_language: string | null;
  listening_language: string | null;
  status: string;
};

type TranslationServerReadiness = {
  ready: boolean;
  mode: "dry-run" | "livekit-node" | "unavailable";
  message: string;
};

type TranslationStatusPayload = {
  serverReadiness: TranslationServerReadiness;
  sessions: TranslationSession[];
  participants: TranslationParticipant[];
};

const ACTIVE_SESSION_STATUSES = new Set(["idle", "starting", "connected", "reconnecting"]);
const LANGUAGE_LABELS: Record<string, string> = {
  ko: "Korean",
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
  ru: "Russian",
  vi: "Vietnamese",
};

export function TranslationStatusPanel({ meetingId }: { meetingId: string }) {
  const [sessions, setSessions] = useState<TranslationSession[]>([]);
  const [participants, setParticipants] = useState<TranslationParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverReadiness, setServerReadiness] = useState<TranslationServerReadiness | null>(null);
  const [startingParticipantId, setStartingParticipantId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/meetings/${meetingId}/translation/status`, { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Unable to load translation status.");
      return;
    }
    const payload = (await response.json()) as TranslationStatusPayload;
    setServerReadiness(payload.serverReadiness ?? null);
    setSessions(payload.sessions ?? []);
    setParticipants(payload.participants ?? []);
    setError(null);
  }, [meetingId]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadStatus(), 0);
    const interval = window.setInterval(() => void loadStatus(), 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [loadStatus]);

  const activeSourceIdentities = useMemo(
    () => new Set(sessions.filter((session) => ACTIVE_SESSION_STATUSES.has(session.status)).map((session) => session.source_identity)),
    [sessions],
  );

  async function startForParticipant(participant: TranslationParticipant) {
    if (!participant.speaking_language) {
      setError("Participant speaking language is required before starting translation.");
      return;
    }

    setError(null);
    setStartingParticipantId(participant.id);
    startTransition(async () => {
      const response = await fetch(`/api/meetings/${meetingId}/translation/start-all`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceParticipantId: participant.id }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Unable to start translation.");
      }

      setStartingParticipantId(null);
      await loadStatus();
    });
  }

  async function stopAll() {
    await fetch(`/api/meetings/${meetingId}/translation/stop`, { method: "POST" });
    await loadStatus();
  }

  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Translation router</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Start server translation per active speaker only after a production LiveKit Agent/media worker is configured.
            Same-language listeners keep original audio; different-language listeners use the matching translation track
            when the worker is connected. In-room browser translation fallback remains separate.
          </p>
          {serverReadiness ? (
            <p className={`mt-3 rounded-2xl px-4 py-3 text-sm ${serverReadiness.ready ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"}`}>
              Server worker: {serverReadiness.mode}. {serverReadiness.message}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={stopAll}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Stop all
        </button>
      </div>

      {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <section className="mt-5 rounded-2xl bg-slate-50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Active participants</h3>
        <div className="mt-3 space-y-3">
          {participants.map((participant) => {
            const hasActiveSession = activeSourceIdentities.has(participant.livekit_identity);
            const serverStartUnavailable = serverReadiness?.ready === false;
            const disabled = isPending || !participant.speaking_language || hasActiveSession || serverStartUnavailable;
            return (
              <div key={participant.id} className="flex flex-col justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center">
                <div>
                  <p className="font-semibold text-slate-950">
                    {participant.display_name} {participant.company ? `(${participant.company})` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {participant.role} · speaks {labelLanguage(participant.speaking_language)} · listens {labelLanguage(participant.listening_language)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void startForParticipant(participant)}
                  className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    serverStartUnavailable
                      ? serverReadiness?.message
                      : !participant.speaking_language
                        ? "Speaking language is missing for this participant."
                        : hasActiveSession
                          ? "Translation sessions already exist for this participant."
                          : undefined
                  }
                >
                  {startingParticipantId === participant.id ? "Starting..." : hasActiveSession ? "Translation active" : "Start translation"}
                </button>
              </div>
            );
          })}
          {participants.length === 0 ? (
            <p className="text-sm text-slate-500">No active participants yet. Join the room, then refresh this panel.</p>
          ) : null}
        </div>
      </section>

      <div className="mt-5 space-y-3">
        {sessions.map((session) => (
          <div key={session.id} className="rounded-2xl border border-slate-200 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-950">
                {labelLanguage(session.source_language)} → {labelLanguage(session.target_language)}
              </p>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {session.status}
              </span>
            </div>
            <p className="mt-2 text-slate-600">Track: {session.target_track_name}</p>
            <p className="mt-1 text-slate-500">Source: {session.source_identity}</p>
            <p className="mt-1 text-slate-500">Last heartbeat: {formatRelativeTime(session.worker_heartbeat_at ?? session.updated_at)}</p>
            {session.last_error ? <p className="mt-2 text-red-600">{session.last_error}</p> : null}
          </div>
        ))}
        {sessions.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            No translation sessions have been started for this meeting yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function labelLanguage(code: string | null) {
  if (!code) return "Not set";
  return LANGUAGE_LABELS[code] ?? code;
}


function formatRelativeTime(value: string | null) {
  if (!value) return "never";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "unknown";
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  return `${Math.round(elapsedMinutes / 60)}h ago`;
}
