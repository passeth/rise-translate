"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import {
  encryptMeetingPassword,
  generateMeetingPassword,
  hashMeetingPassword,
} from "@/server/security/meeting-password";
import { generatePublicRoomToken, toLiveKitRoomName } from "@/features/meetings/tokens";
import { createMeetingSchema } from "@/features/meetings/create-validation";

export type CreateMeetingState = {
  error?: string;
};

export async function createMeeting(
  _: CreateMeetingState,
  formData: FormData,
): Promise<CreateMeetingState> {
  const parsed = createMeetingSchema.safeParse({
    title: formData.get("title"),
    scheduledStartAt: formData.get("scheduledStartAt"),
    buyerCompany: formData.get("buyerCompany"),
    memo: formData.get("memo"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid meeting form." };
  }

  const scheduledStartAt = new Date(parsed.data.scheduledStartAt);

  if (Number.isNaN(scheduledStartAt.valueOf())) {
    return { error: "Scheduled time is invalid." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be signed in to create meetings." };
  }

  const admin = createSupabaseAdminClient();
  const meetingId = randomUUID();
  const publicToken = generatePublicRoomToken();
  const livekitRoomName = toLiveKitRoomName(publicToken);
  const password = generateMeetingPassword();

  const { error: profileError } = await admin.from("rt_host_profiles").upsert({
    id: user.id,
    display_name: user.user_metadata?.name ?? user.email ?? "EVAS Host",
    company: "EVAS",
    is_active: true,
  });

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: meetingError } = await admin.from("rt_meetings").insert({
    id: meetingId,
    host_id: user.id,
    title: parsed.data.title,
    scheduled_start_at: scheduledStartAt.toISOString(),
    buyer_company: parsed.data.buyerCompany,
    memo: parsed.data.memo || null,
    public_token: publicToken,
    livekit_room_name: livekitRoomName,
  });

  if (meetingError) {
    return { error: meetingError.message };
  }

  const { error: secretError } = await admin.from("rt_meeting_access_secrets").insert({
    meeting_id: meetingId,
    password_encrypted: encryptMeetingPassword(password),
    password_hash: hashMeetingPassword(meetingId, password),
  });

  if (secretError) {
    return { error: secretError.message };
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/meetings/${meetingId}`);
}
