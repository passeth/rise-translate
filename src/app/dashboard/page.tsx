import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

type HostProfile = {
  display_name: string;
  company: string;
};

type MeetingSummary = {
  id: string;
  title: string;
  buyer_company: string;
  scheduled_start_at: string;
  lifecycle_status: string;
  notes_status: string;
  recording_status: string;
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: meetings }] = await Promise.all([
    supabase
      .from("rt_host_profiles")
      .select("display_name, company")
      .eq("id", user.id)
      .maybeSingle<HostProfile>(),
    supabase
      .from("rt_meetings")
      .select("id, title, buyer_company, scheduled_start_at, lifecycle_status, notes_status, recording_status")
      .order("scheduled_start_at", { ascending: false })
      .limit(20)
      .returns<MeetingSummary[]>(),
  ]);

  const displayName = profile?.display_name ?? user.email ?? "Host";
  const company = profile?.company ?? "EVAS";

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">EVAS</p>
            <h1 className="text-2xl font-semibold text-slate-950">Meeting dashboard</h1>
          </div>
          <form action={logout}>
            <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-slate-500">Signed in as</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">
              {displayName} ({company})
            </h2>
          </div>
          <Link
            href="/dashboard/meetings/new"
            className="rounded-xl bg-slate-950 px-5 py-3 text-center font-semibold text-white transition hover:bg-slate-800"
          >
            New meeting
          </Link>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-950">Recent meetings</h3>
              <p className="mt-1 text-sm text-slate-500">Title, buyer company, date, and status filters land in a later refinement.</p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Scheduled</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(meetings ?? []).map((meeting) => (
                  <tr key={meeting.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-950">
                      <Link href={`/dashboard/meetings/${meeting.id}`}>{meeting.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{meeting.buyer_company}</td>
                    <td className="px-4 py-3 text-slate-600">{formatKst(meeting.scheduled_start_at)}</td>
                    <td className="px-4 py-3 text-slate-600">{meeting.lifecycle_status}</td>
                  </tr>
                ))}
                {(meetings ?? []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={4}>
                      No meetings yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
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
