import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ publicToken: string }>;
};

type PublicMeeting = {
  title: string;
  buyer_company: string;
  scheduled_start_at: string;
  lifecycle_status: string;
  link_disabled_at: string | null;
};

export default async function MeetingJoinPage({ params }: PageProps) {
  const { publicToken } = await params;
  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("title, buyer_company, scheduled_start_at, lifecycle_status, link_disabled_at")
    .eq("public_token", publicToken)
    .maybeSingle<PublicMeeting>();

  if (!meeting) {
    notFound();
  }

  const ended = meeting.link_disabled_at || meeting.lifecycle_status === "ended";

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <section className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">EVAS Meeting</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{meeting.title}</h1>
        <p className="mt-2 text-slate-600">{meeting.buyer_company}</p>
        <p className="mt-2 text-sm text-slate-500">
          Meeting time: {formatKst(meeting.scheduled_start_at)} · Your local time: {formatLocal(meeting.scheduled_start_at)}
        </p>

        {ended ? (
          <p className="mt-8 rounded-2xl bg-slate-100 p-5 text-slate-700">This meeting has ended.</p>
        ) : (
          <div className="mt-8">
            <JoinForm publicToken={publicToken} />
          </div>
        )}
      </section>
    </main>
  );
}

function formatKst(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatLocal(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
