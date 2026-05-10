"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EndMeetingButton({ meetingId, disabled }: { meetingId: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function endMeeting() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/meetings/${meetingId}/end`, { method: "POST" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Unable to end meeting.");
      setPending(false);
      return;
    }

    router.refresh();
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={endMeeting}
        className="rounded-xl bg-red-600 px-5 py-3 text-center font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Ending..." : "End meeting"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
