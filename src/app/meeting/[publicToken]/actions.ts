"use server";

import { randomBytes, createHash } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupportedLanguage } from "@/lib/languages";
import { hashMeetingPassword } from "@/server/security/meeting-password";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

const joinSchema = z.object({
  publicToken: z.string().min(1),
  displayName: z.string().trim().min(1, "Name is required."),
  company: z.string().trim().min(1, "Company is required."),
  speakingLanguage: z.string().refine(isSupportedLanguage, "Unsupported speaking language."),
  listeningLanguage: z.string().refine(isSupportedLanguage, "Unsupported listening language."),
  password: z.string().regex(/^\d{6}$/, "Enter the 6-digit meeting password."),
  consent: z.literal("on", { error: "Consent is required." }),
});

export type JoinMeetingState = {
  error?: string;
};

type JoinMeeting = {
  id: string;
  scheduled_start_at: string;
  lifecycle_status: string;
  link_disabled_at: string | null;
};

type Secret = {
  password_hash: string;
};

export async function joinMeeting(
  publicToken: string,
  _: JoinMeetingState,
  formData: FormData,
): Promise<JoinMeetingState> {
  const parsed = joinSchema.safeParse({
    publicToken,
    displayName: formData.get("displayName"),
    company: formData.get("company"),
    speakingLanguage: formData.get("speakingLanguage"),
    listeningLanguage: formData.get("listeningLanguage"),
    password: formData.get("password"),
    consent: formData.get("consent"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid join form." };
  }

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("id, scheduled_start_at, lifecycle_status, link_disabled_at")
    .eq("public_token", parsed.data.publicToken)
    .maybeSingle<JoinMeeting>();

  if (!meeting || meeting.link_disabled_at || meeting.lifecycle_status === "ended") {
    return { error: "This meeting is not available." };
  }

  if (meeting.lifecycle_status === "scheduled" && !isInsideGuestEntryWindow(meeting.scheduled_start_at)) {
    return { error: "This meeting is not open for guest entry yet." };
  }

  const { data: secret } = await admin
    .from("rt_meeting_access_secrets")
    .select("password_hash")
    .eq("meeting_id", meeting.id)
    .maybeSingle<Secret>();

  if (!secret || hashMeetingPassword(meeting.id, parsed.data.password) !== secret.password_hash) {
    return { error: "Invalid meeting link or password." };
  }

  const rawSessionToken = randomBytes(32).toString("base64url");
  const sessionTokenHash = createHash("sha256").update(rawSessionToken).digest("hex");
  const requestHeaders = await headers();

  const { error } = await admin.from("rt_guest_sessions").insert({
    meeting_id: meeting.id,
    display_name: parsed.data.displayName,
    company: parsed.data.company,
    speaking_language: parsed.data.speakingLanguage,
    listening_language: parsed.data.listeningLanguage,
    consent_translation: true,
    consent_captions: true,
    consent_transcription: true,
    consent_notes: true,
    consent_possible_recording: true,
    consent_internal_use: true,
    consented_at: new Date().toISOString(),
    session_token_hash: sessionTokenHash,
    status: "created",
    user_agent: requestHeaders.get("user-agent"),
  });

  if (error) {
    return { error: error.message };
  }

  const cookieStore = await cookies();
  cookieStore.set(`guest_session_${meeting.id}`, rawSessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  redirect(`/meeting/${parsed.data.publicToken}/room`);
}

function isInsideGuestEntryWindow(scheduledStartAt: string) {
  const scheduled = new Date(scheduledStartAt).getTime();
  const fifteenMinutes = 15 * 60 * 1000;
  return Date.now() >= scheduled - fifteenMinutes;
}
