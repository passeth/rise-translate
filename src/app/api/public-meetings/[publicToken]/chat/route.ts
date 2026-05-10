import { NextResponse, type NextRequest } from "next/server";
import { resolvePublicMeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { PUBLIC_CHAT_MESSAGE_MAX_LENGTH, trimAndLimitPublicText } from "@/server/public-input-limits";
import { isActiveScopedParticipant } from "@/server/meetings/participant-scope";
import {
  getPublicWriteRateLimitCutoff,
  isPublicWriteRateLimited,
  PUBLIC_CHAT_RATE_LIMIT,
} from "@/server/public-write-rate-limit";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ publicToken: string }>;
};

type ChatMessageRow = {
  id: string;
  body: string;
  sent_at: string;
  rt_meeting_participants: {
    display_name: string;
    company: string;
    role: string;
  } | null;
};

type ChatBody = {
  body?: string;
};

export async function GET(_: NextRequest, context: RouteContext) {
  const { publicToken } = await context.params;
  const access = await resolvePublicMeetingActor(publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("rt_chat_messages")
    .select("id, body, sent_at, rt_meeting_participants(display_name, company, role)")
    .eq("meeting_id", access.meeting.id)
    .order("sent_at", { ascending: true })
    .limit(100)
    .returns<ChatMessageRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    messages: (data ?? []).map((message) => ({
      id: message.id,
      body: message.body,
      sentAt: message.sent_at,
      senderName: message.rt_meeting_participants?.display_name ?? "Unknown",
      senderCompany: message.rt_meeting_participants?.company ?? "",
      role: message.rt_meeting_participants?.role ?? "guest",
    })),
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { publicToken } = await context.params;
  const access = await resolvePublicMeetingActor(publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ChatBody;
  const message = trimAndLimitPublicText(body.body, PUBLIC_CHAT_MESSAGE_MAX_LENGTH);

  if (!message.ok) {
    return NextResponse.json(
      { error: message.reason === "too_long" ? "Message is too long." : "Message is required" },
      { status: message.reason === "too_long" ? 413 : 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  let participant: { id: string; status: string } | null = null;

  if (access.actor.type === "host") {
    const { data } = await admin
      .from("rt_meeting_participants")
      .select("id, status")
      .eq("meeting_id", access.meeting.id)
      .eq("host_user_id", access.actor.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    participant = data ?? null;
  } else {
    const { data } = await admin
      .from("rt_meeting_participants")
      .select("id, status")
      .eq("meeting_id", access.meeting.id)
      .eq("guest_session_id", access.actor.guestSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    participant = data ?? null;
  }

  if (!isActiveScopedParticipant(participant)) {
    return NextResponse.json({ error: "Active participant is required" }, { status: 409 });
  }

  const { count: recentMessageCount, error: rateError } = await admin
    .from("rt_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", access.meeting.id)
    .eq("participant_id", participant.id)
    .gte("sent_at", getPublicWriteRateLimitCutoff({ windowMs: PUBLIC_CHAT_RATE_LIMIT.windowMs }));

  if (rateError) {
    return NextResponse.json({ error: rateError.message }, { status: 500 });
  }

  if (isPublicWriteRateLimited({ count: recentMessageCount, maxWrites: PUBLIC_CHAT_RATE_LIMIT.maxWrites })) {
    return NextResponse.json({ error: "Message rate limit exceeded" }, { status: 429 });
  }

  const { error } = await admin.from("rt_chat_messages").insert({
    meeting_id: access.meeting.id,
    participant_id: participant.id,
    body: message.value,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
