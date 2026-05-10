import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { requireEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { logOperationalEvent } from "@/server/observability/events";
import { recordUsageSnapshot } from "@/server/observability/usage";
import { isGuestSessionUsable } from "@/server/meetings/access";
import { getLiveKitTokenTtl } from "@/server/livekit/token-ttl";

export const dynamic = "force-dynamic";

type TokenRequest = {
  publicToken?: string;
};

type Meeting = {
  id: string;
  host_id: string;
  public_token: string;
  livekit_room_name: string;
  lifecycle_status: string;
  link_disabled_at: string | null;
};

type HostProfile = {
  display_name: string;
  company: string;
};

type GuestSession = {
  id: string;
  display_name: string;
  company: string;
  speaking_language: string;
  listening_language: string;
  session_token_hash: string;
  status: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as TokenRequest;

  if (!body.publicToken) {
    return NextResponse.json({ error: "publicToken is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("rt_meetings")
    .select("id, host_id, public_token, livekit_room_name, lifecycle_status, link_disabled_at")
    .eq("public_token", body.publicToken)
    .maybeSingle<Meeting>();

  if (!meeting || meeting.link_disabled_at || meeting.lifecycle_status === "ended") {
    return NextResponse.json({ error: "Meeting is not available" }, { status: 404 });
  }

  const hostToken = await tryCreateHostToken(meeting);
  if (hostToken) {
    return NextResponse.json(hostToken);
  }

  const guestToken = await tryCreateGuestToken(meeting);
  if (!guestToken) {
    return NextResponse.json({ error: "Guest session is required" }, { status: 401 });
  }

  return NextResponse.json(guestToken);
}

async function tryCreateHostToken(meeting: Meeting) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== meeting.host_id) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("rt_host_profiles")
    .select("display_name, company")
    .eq("id", user.id)
    .maybeSingle<HostProfile>();

  const displayName = profile?.display_name ?? user.email ?? "EVAS Host";
  const company = profile?.company ?? "EVAS";
  const identity = `host_${user.id}_${randomBytes(5).toString("base64url")}`;
  const now = new Date().toISOString();

  const { data: participant, error: participantError } = await admin.from("rt_meeting_participants").insert({
    meeting_id: meeting.id,
    host_user_id: user.id,
    role: "host",
    display_name: displayName,
    company,
    speaking_language: "ko",
    listening_language: "ko",
    livekit_identity: identity,
    status: "active",
    joined_at: now,
    last_seen_at: now,
  }).select("id").single<{ id: string }>();

  if (participantError) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "livekit",
      eventType: "host_participant_insert_failed",
      severity: "error",
      errorType: "supabase_error",
      message: participantError.message,
      metadata: { role: "host" },
    });
  }

  await markMeetingInProgress(meeting.id);
  await logOperationalEvent({
    supabase: admin,
    meetingId: meeting.id,
    roomName: meeting.livekit_room_name,
    featureArea: "livekit",
    eventType: "participant_joined",
    message: "Host LiveKit token issued and participant marked active.",
    metadata: { role: "host" },
  });
  await recordUsageSnapshot({ supabase: admin, meetingId: meeting.id, reason: "participant_join", metadata: { role: "host" } });

  return buildTokenResponse({
    identity,
    name: `${displayName} (${company})`,
    roomName: meeting.livekit_room_name,
    metadata: {
      role: "host",
      meetingId: meeting.id,
      participantId: participant?.id,
      userId: user.id,
      displayName,
      company,
      speakingLanguage: "ko",
      listeningLanguage: "ko",
    },
  });
}

async function tryCreateGuestToken(meeting: Meeting) {
  const cookieStore = await cookies();
  const rawGuestToken = cookieStore.get(`guest_session_${meeting.id}`)?.value;

  if (!rawGuestToken) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const sessionTokenHash = createHash("sha256").update(rawGuestToken).digest("hex");
  const { data: guest } = await admin
    .from("rt_guest_sessions")
    .select("id, display_name, company, speaking_language, listening_language, session_token_hash, status")
    .eq("meeting_id", meeting.id)
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle<GuestSession>();

  if (!guest || !isGuestSessionUsable(guest.status)) {
    return null;
  }

  const identity = `guest_${guest.id}_${randomBytes(5).toString("base64url")}`;
  const now = new Date().toISOString();

  await admin
    .from("rt_guest_sessions")
    .update({ status: "active", joined_at: now, last_seen_at: now })
    .eq("id", guest.id);

  const { data: participant, error: participantError } = await admin.from("rt_meeting_participants").insert({
    meeting_id: meeting.id,
    guest_session_id: guest.id,
    role: "guest",
    display_name: guest.display_name,
    company: guest.company,
    speaking_language: guest.speaking_language,
    listening_language: guest.listening_language,
    livekit_identity: identity,
    status: "active",
    joined_at: now,
    last_seen_at: now,
  }).select("id").single<{ id: string }>();

  if (participantError) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: meeting.id,
      roomName: meeting.livekit_room_name,
      featureArea: "livekit",
      eventType: "guest_participant_insert_failed",
      severity: "error",
      errorType: "supabase_error",
      message: participantError.message,
      metadata: { role: "guest", guestSessionId: guest.id },
    });
  }

  await markMeetingInProgress(meeting.id);
  await logOperationalEvent({
    supabase: admin,
    meetingId: meeting.id,
    roomName: meeting.livekit_room_name,
    featureArea: "livekit",
    eventType: "participant_joined",
    message: "Guest LiveKit token issued and participant marked active.",
    metadata: { role: "guest", guestSessionId: guest.id },
  });
  await recordUsageSnapshot({ supabase: admin, meetingId: meeting.id, reason: "participant_join", metadata: { role: "guest" } });

  return buildTokenResponse({
    identity,
    name: `${guest.display_name} (${guest.company})`,
    roomName: meeting.livekit_room_name,
    metadata: {
      role: "guest",
      meetingId: meeting.id,
      participantId: participant?.id,
      guestSessionId: guest.id,
      displayName: guest.display_name,
      company: guest.company,
      speakingLanguage: guest.speaking_language,
      listeningLanguage: guest.listening_language,
    },
  });
}

async function markMeetingInProgress(meetingId: string) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  await admin
    .from("rt_meetings")
    .update({ lifecycle_status: "in_progress", started_at: now, empty_since_at: null, updated_at: now })
    .eq("id", meetingId)
    .eq("lifecycle_status", "scheduled");
}

async function buildTokenResponse({
  identity,
  name,
  roomName,
  metadata,
}: {
  identity: string;
  name: string;
  roomName: string;
  metadata: Record<string, unknown>;
}) {
  const accessToken = new AccessToken(requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"), {
    identity,
    name,
    metadata: JSON.stringify(metadata),
    ttl: getLiveKitTokenTtl(),
  });

  accessToken.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  return {
    token: await accessToken.toJwt(),
    url: requireEnv("LIVEKIT_URL"),
    roomName,
  };
}
