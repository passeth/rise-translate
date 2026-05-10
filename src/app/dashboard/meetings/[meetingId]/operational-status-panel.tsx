import { getOperationalStatusTone, summarizeCaptionStatus, summarizeTranslationStatus as summarizeTranslationSessions } from "@/features/livekit/operational-status";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { getProductionReadinessChecks, summarizeProductionReadiness } from "@/server/operations/preflight";

type OperationalStatusPanelProps = {
  meeting: {
    id: string;
    livekit_room_name: string;
    notes_status: string;
    recording_status: string;
  };
};

type OperationalEventRow = {
  id: string;
  feature_area: string;
  event_type: string;
  severity: string;
  error_type: string | null;
  message: string | null;
  occurred_at: string;
};

type TokenOperationalEventRow = {
  event_type: string;
  severity: string;
};

type UsageSnapshotRow = {
  id: string;
  captured_at: string;
  reason: string;
  meeting_duration_seconds: number;
  active_participant_count: number;
  total_participant_count: number;
  recording_duration_seconds: number;
  translation_session_count: number;
  translation_connected_count: number;
  translation_failed_count: number;
};

type TranslationSessionRow = {
  status: string;
  source_identity: string;
  target_language: string;
  updated_at: string;
  worker_heartbeat_at: string | null;
};

type CaptionStatusRow = {
  started_at: string;
};

export async function OperationalStatusPanel({ meeting }: OperationalStatusPanelProps) {
  const admin = createSupabaseAdminClient();
  const [eventsResult, usageResult, translationsResult, captionsResult, tokenEventsResult] = await Promise.all([
    admin
      .from("rt_operational_events")
      .select("id, feature_area, event_type, severity, error_type, message, occurred_at")
      .eq("meeting_id", meeting.id)
      .order("occurred_at", { ascending: false })
      .limit(8)
      .returns<OperationalEventRow[]>(),
    admin
      .from("rt_usage_snapshots")
      .select(
        "id, captured_at, reason, meeting_duration_seconds, active_participant_count, total_participant_count, recording_duration_seconds, translation_session_count, translation_connected_count, translation_failed_count",
      )
      .eq("meeting_id", meeting.id)
      .order("captured_at", { ascending: false })
      .limit(3)
      .returns<UsageSnapshotRow[]>(),
    admin
      .from("rt_translation_sessions")
      .select("status, source_identity, target_language, updated_at, worker_heartbeat_at")
      .eq("meeting_id", meeting.id)
      .order("updated_at", { ascending: false })
      .returns<TranslationSessionRow[]>(),
    admin
      .from("rt_transcript_segments")
      .select("started_at")
      .eq("meeting_id", meeting.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .returns<CaptionStatusRow[]>(),
    admin
      .from("rt_operational_events")
      .select("event_type, severity")
      .eq("meeting_id", meeting.id)
      .in("event_type", [
        "translation_token_issued",
        "translation_token_denied",
        "translation_token_rate_limited",
        "translation_token_openai_failed",
        "translation_token_openai_malformed",
      ])
      .returns<TokenOperationalEventRow[]>(),
  ]);

  const translationStatus = summarizeDashboardTranslationStatus(translationsResult.data ?? []);
  const captionStatus = summarizeCaptionStatus(captionsResult.data ?? []);
  const readinessChecks = getProductionReadinessChecks();
  const readinessSummary = summarizeProductionReadiness(readinessChecks);
  const readinessIssues = readinessChecks.filter((check) => check.severity !== "ok").slice(0, 5);
  const latestUsage = usageResult.data?.[0] ?? null;
  const events = eventsResult.data ?? [];
  const tokenEventSummary = summarizeTokenEvents(tokenEventsResult.data ?? []);

  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Operations</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Host troubleshooting state</h2>
          <p className="mt-2 text-sm text-slate-600">
            Live operational statuses, recent safe server events, and usage snapshots for this meeting.
          </p>
        </div>
        <p className="rounded-2xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">
          Room {meeting.livekit_room_name}
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard label="Translation" status={translationStatus.status} description={translationStatus.description} />
        <StatusCard label="Captions" status={captionStatus.status} description={captionStatus.message} />
        <StatusCard label="Recording" status={meeting.recording_status} description={describeRecording(meeting.recording_status)} />
        <StatusCard label="Notes" status={meeting.notes_status} description={describeNotes(meeting.notes_status)} />
      </div>


      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h3 className="font-semibold text-slate-950">Production preflight</h3>
            <p className="mt-2 text-sm text-slate-600">{readinessSummary.message}</p>
          </div>
          <span className={statusBadgeClass(readinessSummary.severity)}>{readinessSummary.severity}</span>
        </div>
        {readinessIssues.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {readinessIssues.map((check) => (
              <div key={check.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{check.label}</p>
                  <span className={statusBadgeClass(check.severity)}>{check.severity}</span>
                </div>
                <p className="mt-2 text-slate-600">{check.message}</p>
                {check.action ? <p className="mt-2 text-xs font-semibold text-cyan-700">Next: {check.action}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-950">Latest usage</h3>
          {latestUsage ? (
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <MiniMetric label="Duration" value={formatDuration(latestUsage.meeting_duration_seconds)} />
              <MiniMetric
                label="Participants"
                value={`${latestUsage.active_participant_count}/${latestUsage.total_participant_count}`}
              />
              <MiniMetric label="Recording" value={formatDuration(latestUsage.recording_duration_seconds)} />
              <MiniMetric
                label="Translation"
                value={`${latestUsage.translation_connected_count}/${latestUsage.translation_session_count} connected`}
              />
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No usage snapshots recorded yet.</p>
          )}
        </div>


        <div className="rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-950">Translation token activity</h3>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <MiniMetric label="Issued" value={String(tokenEventSummary.issued)} />
            <MiniMetric label="Denied" value={String(tokenEventSummary.denied)} />
            <MiniMetric label="Rate limited" value={String(tokenEventSummary.rateLimited)} />
            <MiniMetric label="OpenAI errors" value={String(tokenEventSummary.openaiErrors)} />
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-950">Recent events</h3>
          <div className="mt-4 space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={badgeClass(event.severity)}>{event.severity}</span>
                  <span className="font-semibold text-slate-950">{event.feature_area}</span>
                  <span className="text-slate-500">{event.event_type}</span>
                </div>
                {event.message ? <p className="mt-2 text-slate-600">{event.message}</p> : null}
                <p className="mt-2 text-xs text-slate-400">
                  {event.error_type ? `${event.error_type} · ` : ""}{formatTime(event.occurred_at)}
                </p>
              </div>
            ))}
            {events.length === 0 ? <p className="text-sm text-slate-500">No operational events recorded yet.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, status, description }: { label: string; status: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        <span className={statusBadgeClass(status)}>{status}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function summarizeTokenEvents(events: TokenOperationalEventRow[]) {
  return {
    issued: events.filter((event) => event.event_type === "translation_token_issued").length,
    denied: events.filter((event) => event.event_type === "translation_token_denied").length,
    rateLimited: events.filter((event) => event.event_type === "translation_token_rate_limited").length,
    openaiErrors: events.filter((event) => event.event_type.startsWith("translation_token_openai_")).length,
  };
}

function summarizeDashboardTranslationStatus(sessions: TranslationSessionRow[]) {
  const summary = summarizeTranslationSessions(sessions);
  return { status: summary.status, description: summary.message };
}


function describeRecording(status: string) {
  if (status === "active") return "Recording is active and participants should see the indicator.";
  if (status === "failed") return "Recording failed. Check recent events before relying on playback.";
  if (status === "processing") return "Recording is processing after meeting end.";
  return "Recording is not currently active.";
}

function describeNotes(status: string) {
  if (status === "generating") return "Meeting notes are processing.";
  if (status === "failed") return "Meeting notes generation failed and needs retry.";
  if (status === "complete") return "Meeting notes are available to the host.";
  return "Meeting notes have not started.";
}

function statusBadgeClass(status: string) {
  const tone = getOperationalStatusTone(status);
  const classes = {
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    muted: "bg-slate-100 text-slate-600",
  }[tone];
  return `rounded-full px-3 py-1 text-xs font-semibold ${classes}`;
}

function badgeClass(severity: string) {
  if (severity === "error") return "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700";
  if (severity === "warning") return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700";
  return "rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700";
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
