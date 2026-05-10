import Link from "next/link";

const principles = [
  "Original LiveKit meeting stays available when AI layers fail",
  "Server-routed translation from individual speaker tracks",
  "English-only v1 UI for hosts and guests",
  "Host-owned notes and in-app recording playback",
];

const slices = [
  "Create scheduled buyer meetings",
  "Invite guests with link + 6-digit password",
  "Select speaking and listening languages",
  "Use captions, chat, screen share, notes, and recording",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <div className="mb-8 inline-flex w-fit rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
          EVAS internal buyer meetings · v1 scaffold
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-balance md:text-7xl">
              Real-time translated meetings for global buyer calls.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              A LiveKit-based video meeting app with OpenAI-powered interpretation,
              captions, Markdown meeting notes, screen sharing, chat, and controlled
              recording for EVAS-hosted buyer meetings.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="rounded-full bg-cyan-300 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Host login
              </Link>
              <Link
                href="/meeting/demo"
                className="rounded-full border border-white/15 px-6 py-3 text-center font-semibold text-white transition hover:bg-white/10"
              >
                Guest entry preview
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur">
            <h2 className="text-xl font-semibold">Implementation baseline</h2>
            <ul className="mt-6 space-y-4">
              {principles.map((principle) => (
                <li key={principle} className="flex gap-3 text-slate-200">
                  <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300" />
                  <span>{principle}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-2xl bg-slate-900/80 p-5">
              <h3 className="font-medium text-cyan-100">Primary v1 paths</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {slices.map((slice) => (
                  <div key={slice} className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">
                    {slice}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
