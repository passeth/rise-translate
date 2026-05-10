import Link from "next/link";
import { CreateMeetingForm } from "./create-meeting-form";

export default function NewMeetingPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <section className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <Link href="/dashboard" className="text-sm font-semibold text-cyan-700">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">Create buyer meeting</h1>
        <p className="mt-3 text-slate-600">
          The app will generate a secure invite link and 6-digit meeting password.
        </p>
        <div className="mt-8">
          <CreateMeetingForm />
        </div>
      </section>
    </main>
  );
}
