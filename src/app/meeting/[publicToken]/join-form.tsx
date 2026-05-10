"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import { joinMeeting, type JoinMeetingState } from "./actions";

const initialState: JoinMeetingState = {};

export function JoinForm({ publicToken }: { publicToken: string }) {
  const [state, formAction, pending] = useActionState(joinMeeting.bind(null, publicToken), initialState);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [deviceState, setDeviceState] = useState("Device preview is optional.");

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function preview() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setDeviceState("Camera and microphone preview ready.");
      } catch {
        setDeviceState("Camera/microphone preview unavailable. You can still join muted or camera-off.");
      }
    }

    void preview();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" name="displayName" required />
        <Field label="Company" name="company" required />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <LanguageSelect label="Speaking language" name="speakingLanguage" />
        <LanguageSelect label="Listening language" name="listeningLanguage" />
      </div>

      <Field label="Meeting password" name="password" type="password" inputMode="numeric" pattern="\d{6}" required />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="font-semibold text-slate-950">Device check</h2>
        <p className="mt-1 text-sm text-slate-600">{deviceState}</p>
        <video ref={videoRef} autoPlay muted playsInline className="mt-4 aspect-video w-full rounded-xl bg-slate-900 object-cover" />
        <p className="mt-3 text-xs text-slate-500">
          For best translation quality, please use a headset and speak one at a time.
        </p>
      </div>

      <label className="flex gap-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
        <input name="consent" type="checkbox" required className="mt-1" />
        <span>
          I agree that this meeting may use real-time translation, captions, transcription,
          meeting notes, and recording for internal business purposes.
        </span>
      </label>

      {state.error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Joining..." : "Join meeting"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  ...props
}: {
  label: string;
  name: string;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" {...props} />
    </div>
  );
}

function LanguageSelect({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3">
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </div>
  );
}
