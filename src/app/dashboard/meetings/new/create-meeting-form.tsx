"use client";

import { useActionState } from "react";
import {
  MEETING_BUYER_COMPANY_MAX_LENGTH,
  MEETING_MEMO_MAX_LENGTH,
  MEETING_TITLE_MAX_LENGTH,
} from "@/features/meetings/create-validation";
import { createMeeting, type CreateMeetingState } from "../actions";

const initialState: CreateMeetingState = {};

export function CreateMeetingForm() {
  const [state, formAction, pending] = useActionState(createMeeting, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="title">
          Meeting title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={MEETING_TITLE_MAX_LENGTH}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="scheduledStartAt">
          Scheduled time
        </label>
        <input
          id="scheduledStartAt"
          name="scheduledStartAt"
          type="datetime-local"
          required
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
        <p className="mt-2 text-xs text-slate-500">Stored in UTC and displayed to hosts in KST.</p>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="buyerCompany">
          Buyer company
        </label>
        <input
          id="buyerCompany"
          name="buyerCompany"
          required
          maxLength={MEETING_BUYER_COMPANY_MAX_LENGTH}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="memo">
          Memo
        </label>
        <textarea
          id="memo"
          name="memo"
          rows={4}
          maxLength={MEETING_MEMO_MAX_LENGTH}
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
      </div>

      {state.error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create meeting"}
      </button>
    </form>
  );
}
