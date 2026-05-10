"use client";

import { useEffect, useState, useTransition } from "react";

type RecordingPayload = {
  meetingStatus: string;
  storage: {
    configured: boolean;
    message: string;
    missingEnv: string[];
  };
  setup: {
    dashboardUrl: string;
    docsUrl: string;
  };
  recording: null | {
    id: string;
    status: string;
    startedAt: string | null;
    stoppedAt: string | null;
    availableAt: string | null;
    expiresAt: string | null;
    playbackUrl: string | null;
  };
};

type RecordingPanelProps = {
  meetingId: string;
  initialStatus: string;
  initialStorage: RecordingPayload["storage"];
  initialSetup: RecordingPayload["setup"];
};

export function RecordingPanel({ meetingId, initialStatus, initialStorage, initialSetup }: RecordingPanelProps) {
  const [payload, setPayload] = useState<RecordingPayload>({
    meetingStatus: initialStatus,
    storage: initialStorage,
    setup: initialSetup,
    recording: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const response = await fetch(`/api/meetings/${meetingId}/recording/status`, { cache: "no-store" });
    if (!response.ok) return;
    setPayload((await response.json()) as RecordingPayload);
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  function mutate(action: "start" | "stop") {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/meetings/${meetingId}/recording/${action}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Unable to ${action} recording.`);
        await refresh();
        return;
      }
      await refresh();
    });
  }

  const status = payload.recording?.status ?? payload.meetingStatus;
  const canStart = payload.storage.configured && !["active", "processing"].includes(status);
  const canStop = status === "active";

  return (
    <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Recording</h2>
          <p className="mt-2 text-sm text-slate-600">
            Host-only in-app playback. Files expire automatically after 7 days; download is intentionally unavailable.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canStart || isPending}
            onClick={() => mutate("start")}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start recording
          </button>
          <button
            type="button"
            disabled={!canStop || isPending}
            onClick={() => mutate("stop")}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Stop
          </button>
        </div>
      </div>

      {!payload.storage.configured ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Recording storage setup required</p>
          <p className="mt-1">{payload.storage.message}</p>
          <p className="mt-2 text-xs">
            Generate Supabase Storage S3 access keys, set the missing LIVEKIT_RECORDING_S3_* variables, then run{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5">pnpm recording:storage:finalize</code>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <a
              href={payload.setup.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-amber-100 px-3 py-1 text-amber-950 transition hover:bg-amber-200"
            >
              Open Supabase S3 settings
            </a>
            <a
              href={payload.setup.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-white px-3 py-1 text-amber-950 ring-1 ring-amber-200 transition hover:bg-amber-100"
            >
              S3 setup docs
            </a>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <Detail label="Status" value={status} />
        <Detail label="Started" value={payload.recording?.startedAt ? formatKst(payload.recording.startedAt) : "—"} />
        <Detail label="Expires" value={payload.recording?.expiresAt ? formatKst(payload.recording.expiresAt) : "—"} />
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {payload.recording?.status === "available" && payload.recording.playbackUrl ? (
        <video controls className="mt-5 aspect-video w-full rounded-2xl bg-slate-950" src={payload.recording.playbackUrl}>
          <track kind="captions" />
        </video>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-950">{value}</p>
    </div>
  );
}

function formatKst(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
