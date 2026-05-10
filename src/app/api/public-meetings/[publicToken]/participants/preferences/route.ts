import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupportedLanguage } from "@/lib/languages";
import { resolvePublicMeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ publicToken: string }>;
};

const preferencesSchema = z.object({
  identity: z.string().min(1),
  speakingLanguage: z.string().refine(isSupportedLanguage, "Unsupported speaking language."),
  listeningLanguage: z.string().refine(isSupportedLanguage, "Unsupported listening language."),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { publicToken } = await context.params;
  const access = await resolvePublicMeetingActor(publicToken);

  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  const parsed = preferencesSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid participant preferences" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const query = admin
    .from("rt_meeting_participants")
    .update({
      speaking_language: parsed.data.speakingLanguage,
      listening_language: parsed.data.listeningLanguage,
      last_seen_at: new Date().toISOString(),
    })
    .eq("meeting_id", access.meeting.id)
    .eq("livekit_identity", parsed.data.identity);

  const scopedQuery =
    access.actor.type === "host"
      ? query.eq("host_user_id", access.actor.userId)
      : query.eq("guest_session_id", access.actor.guestSessionId);

  const { data, error } = await scopedQuery.select("id").maybeSingle<{ id: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
