"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MeetingNotesPanelProps = {
  meetingId: string;
  status: string;
  markdown: string | null;
  failedReason: string | null;
  generatedAt: string | null;
  retryCount: number;
};

export function MeetingNotesPanel({
  meetingId,
  status,
  markdown,
  failedReason,
  generatedAt,
  retryCount,
}: MeetingNotesPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retryGeneration() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/meetings/${meetingId}/notes/retry`, { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Unable to retry notes generation.");
      setPending(false);
      router.refresh();
      return;
    }

    router.refresh();
    setPending(false);
  }

  return (
    <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Meeting notes</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Markdown notes</h2>
          <p className="mt-2 text-sm text-slate-600">
            Notes are generated from original transcript + Korean translation. Chat is kept only as a separate log.
          </p>
        </div>
        <span className={statusBadgeClass(status)}>{status}</span>
      </div>

      {status === "complete" && markdown ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/meetings/${meetingId}/notes`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              View Markdown
            </a>
            <a
              href={`/api/meetings/${meetingId}/notes?download=1`}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Download .md
            </a>
          </div>
          <p className="text-xs text-slate-500">
            Generated {generatedAt ? formatKst(generatedAt) : "recently"}. Editing/PDF/DOCX export are not enabled.
          </p>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-5 text-sm leading-6 text-slate-100">
            {markdown}
          </pre>
        </div>
      ) : null}

      {status === "generating" ? (
        <p className="mt-6 rounded-2xl bg-cyan-50 p-4 text-sm text-cyan-900">
          Notes generation is running. Refresh this page in a moment.
        </p>
      ) : null}

      {status === "failed" ? (
        <div className="mt-6 space-y-4 rounded-2xl bg-red-50 p-5 text-sm text-red-900">
          <div>
            <p className="font-semibold">Notes generation failed.</p>
            <p className="mt-1">{failedReason ?? "Unknown error."}</p>
            <p className="mt-1 text-red-700">Retry count: {retryCount}</p>
          </div>
          <button
            type="button"
            onClick={retryGeneration}
            disabled={pending}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Retrying..." : "Retry generation"}
          </button>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      ) : null}

      {status === "none" ? (
        <p className="mt-6 rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
          Notes will be generated automatically after the meeting ends.
        </p>
      ) : null}
    </section>
  );
}

function statusBadgeClass(status: string) {
  const base = "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]";

  if (status === "complete") {
    return `${base} bg-emerald-100 text-emerald-800`;
  }

  if (status === "failed") {
    return `${base} bg-red-100 text-red-800`;
  }

  if (status === "generating") {
    return `${base} bg-cyan-100 text-cyan-800`;
  }

  return `${base} bg-slate-100 text-slate-700`;
}

function formatKst(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
