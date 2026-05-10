import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buildInvitationText, getMeetingUrl } from "@/features/meetings/invite";
import { decryptMeetingPassword } from "@/server/security/meeting-password";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { EndMeetingButton } from "./end-meeting-button";
import { MeetingNotesPanel } from "./notes-panel";
import { OperationalStatusPanel } from "./operational-status-panel";
import { TranslationStatusPanel } from "./translation-status-panel";
import { RecordingPanel } from "./recording-panel";
import { TranslationCostEstimator } from "./translation-cost-estimator";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getRecordingStorageReadiness } from "@/server/recordings/livekit-egress";
import { buildRecordingStorageSetupGuide } from "@/server/recordings/storage-setup";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ meetingId: string }>;
};

type MeetingDetail = {
  id: string;
  title: string;
  scheduled_start_at: string;
  buyer_company: string;
  memo: string | null;
  public_token: string;
  livekit_room_name: string;
  lifecycle_status: string;
  notes_status: string;
  recording_status: string;
};

type MeetingSecret = {
  password_encrypted: string;
};

type MeetingNotesRow = {
  status: string;
  markdown: string | null;
  failed_reason: string | null;
  generated_at: string | null;
  retry_count: number;
};

export default async function MeetingDetailPage({ params }: PageProps) {
  const { meetingId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: meeting } = await supabase
    .from("rt_meetings")
    .select(
      "id, title, scheduled_start_at, buyer_company, memo, public_token, livekit_room_name, lifecycle_status, notes_status, recording_status",
    )
    .eq("id", meetingId)
    .maybeSingle<MeetingDetail>();

  if (!meeting) {
    notFound();
  }

  const admin = createSupabaseAdminClient();
  const { data: secret } = await admin
    .from("rt_meeting_access_secrets")
    .select("password_encrypted")
    .eq("meeting_id", meeting.id)
    .maybeSingle<MeetingSecret>();

  const { data: notes } = await supabase
    .from("rt_meeting_notes")
    .select("status, markdown, failed_reason, generated_at, retry_count")
    .eq("meeting_id", meeting.id)
    .maybeSingle<MeetingNotesRow>();

  const password = secret ? decryptMeetingPassword(secret.password_encrypted) : "Unavailable";
  const inviteText = buildInvitationText({
    title: meeting.title,
    publicToken: meeting.public_token,
    password,
    scheduledStartAt: meeting.scheduled_start_at,
  });
  const recordingStorage = getRecordingStorageReadiness();
  const recordingStorageSetup = buildRecordingStorageSetupGuide();

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <section className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard" className="text-sm font-semibold text-cyan-700">
          ← Back to dashboard
        </Link>

        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Meeting</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-950">{meeting.title}</h1>
              <p className="mt-3 text-slate-600">{meeting.buyer_company}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/meeting/${meeting.public_token}/room`}
                className="rounded-xl bg-cyan-300 px-5 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Open meeting
              </Link>
              <EndMeetingButton meetingId={meeting.id} disabled={meeting.lifecycle_status === "ended"} />
            </div>
          </div>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Scheduled" value={formatKst(meeting.scheduled_start_at)} />
            <Detail label="Lifecycle" value={meeting.lifecycle_status} />
            <Detail label="Notes" value={meeting.notes_status} />
            <Detail label="Recording" value={meeting.recording_status} />
          </dl>
        </div>

        <OperationalStatusPanel meeting={meeting} />
        <TranslationCostEstimator />

        <TranslationStatusPanel meetingId={meeting.id} />
        <RecordingPanel
          meetingId={meeting.id}
          initialStatus={meeting.recording_status}
          initialStorage={recordingStorage}
          initialSetup={{ dashboardUrl: recordingStorageSetup.dashboardUrl, docsUrl: recordingStorageSetup.docsUrl }}
        />
        <MeetingNotesPanel
          meetingId={meeting.id}
          status={notes?.status ?? meeting.notes_status}
          markdown={notes?.markdown ?? null}
          failedReason={notes?.failed_reason ?? null}
          generatedAt={notes?.generated_at ?? null}
          retryCount={notes?.retry_count ?? 0}
        />

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-950">Invite details</h2>
            <div className="mt-5 space-y-4 text-sm">
              <Detail label="Guest link" value={getMeetingUrl(meeting.public_token)} />
              <Detail label="Password" value={password} />
              <Detail label="LiveKit room" value={meeting.livekit_room_name} />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-950">Invitation text</h2>
            <pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-950 p-5 text-sm leading-6 text-slate-100">
              {inviteText}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-950">{value}</dd>
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
