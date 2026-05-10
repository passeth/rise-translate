import { createHash } from "crypto";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type MeetingActor =
  | { type: "host"; userId: string; displayName: string; company: string }
  | { type: "guest"; guestSessionId: string; displayName: string; company: string };

export type PublicMeetingAccess = {
  meeting: {
    id: string;
    host_id: string;
    public_token: string;
    lifecycle_status: string;
    link_disabled_at: string | null;
    livekit_room_name: string;
  };
  actor: MeetingActor;
};

type MeetingAccessRow = PublicMeetingAccess["meeting"];

type HostProfileRow = {
  display_name: string;
  company: string;
};

type GuestSessionRow = {
  id: string;
  display_name: string;
  company: string;
  status: string;
};

export function isGuestSessionUsable(status: string | null | undefined) {
  return status === "created" || status === "active" || status === "left";
}

export async function resolvePublicMeetingActor(publicToken: string): Promise<PublicMeetingAccess | null> {
  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("id, host_id, public_token, lifecycle_status, link_disabled_at, livekit_room_name")
    .eq("public_token", publicToken)
    .maybeSingle<MeetingAccessRow>();

  if (!meeting || meeting.link_disabled_at || meeting.lifecycle_status === "ended") {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id === meeting.host_id) {
    const { data: profile } = await admin
      .from("rt_host_profiles")
      .select("display_name, company")
      .eq("id", user.id)
      .maybeSingle<HostProfileRow>();

    return {
      meeting,
      actor: {
        type: "host",
        userId: user.id,
        displayName: profile?.display_name ?? user.email ?? "EVAS Host",
        company: profile?.company ?? "EVAS",
      },
    };
  }

  const cookieStore = await cookies();
  const rawGuestToken = cookieStore.get(`guest_session_${meeting.id}`)?.value;

  if (!rawGuestToken) {
    return null;
  }

  const sessionTokenHash = createHash("sha256").update(rawGuestToken).digest("hex");
  const { data: guest } = await admin
    .from("rt_guest_sessions")
    .select("id, display_name, company, status")
    .eq("meeting_id", meeting.id)
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle<GuestSessionRow>();

  if (!guest || !isGuestSessionUsable(guest.status)) {
    return null;
  }

  return {
    meeting,
    actor: {
      type: "guest",
      guestSessionId: guest.id,
      displayName: guest.display_name,
      company: guest.company,
    },
  };
}
