import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv, requireEnv } from "@/lib/env";
import { isSupportedLanguage, type SupportedLanguageCode } from "@/lib/languages";
import { resolvePublicMeetingActor, type MeetingActor } from "@/server/meetings/access";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { validateTranslationTokenRequest, TranslationTokenPolicyError } from "@/server/translation/token-policy";
import { logOperationalEvent } from "@/server/observability/events";
import {
  assertTranslationTokenRateLimit,
  getTranslationTokenWindowStart,
  TranslationTokenRateLimitError,
} from "@/server/translation/token-rate-limit";
import {
  buildTranslationClientSecretRequest,
  normalizeTranslationLanguage,
} from "@/lib/realtime-translation-config";

export const dynamic = "force-dynamic";

type ClientSecretResponse = {
  value?: string;
  expires_at?: number;
  client_secret?: {
    value?: string;
    expires_at?: number;
  };
};

type SourceParticipantRow = {
  livekit_identity: string;
  speaking_language: string | null;
  status: string;
};

type ListenerParticipantRow = {
  livekit_identity: string;
  listening_language: string | null;
  status: string;
};

type TokenEventRow = {
  id: string;
};

const requestSchema = z.object({
  publicToken: z.string().min(1),
  sourceIdentity: z.string().min(1),
  listenerIdentity: z.string().min(1),
  language: z.string().refine(isSupportedLanguage, "Unsupported translation language."),
  sourceLanguage: z.string().refine(isSupportedLanguage, "Unsupported source language.").optional(),
  inputTranscriptionEnabled: z.boolean().default(true),
  noiseReductionEnabled: z.boolean().default(true),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid translation token request" }, { status: 400 });
  }

  const access = await resolvePublicMeetingActor(parsed.data.publicToken);
  if (!access) {
    return NextResponse.json({ error: "Meeting access denied" }, { status: 401 });
  }

  let language: SupportedLanguageCode;
  try {
    language = normalizeTranslationLanguage(parsed.data.language);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unsupported translation language" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: sourceParticipant, error: participantError }, { data: listenerParticipant, error: listenerError }] =
    await Promise.all([
      admin
        .from("rt_meeting_participants")
        .select("livekit_identity, speaking_language, status")
        .eq("meeting_id", access.meeting.id)
        .eq("livekit_identity", parsed.data.sourceIdentity)
        .maybeSingle<SourceParticipantRow>(),
      buildListenerParticipantQuery({
        admin,
        meetingId: access.meeting.id,
        listenerIdentity: parsed.data.listenerIdentity,
        actor: access.actor,
      }),
    ]);

  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 500 });
  }

  if (listenerError) {
    return NextResponse.json({ error: listenerError.message }, { status: 500 });
  }

  let sourceLanguage: SupportedLanguageCode;
  try {
    sourceLanguage = validateTranslationTokenRequest({
      sourceParticipant,
      listenerParticipant,
      requestedSourceLanguage: parsed.data.sourceLanguage,
      targetLanguage: language,
    }).sourceLanguage;
  } catch (error) {
    if (error instanceof TranslationTokenPolicyError) {
      await logOperationalEvent({
        supabase: admin,
        meetingId: access.meeting.id,
        roomName: access.meeting.livekit_room_name,
        featureArea: "translation",
        eventType: "translation_token_denied",
        severity: "warning",
        errorType: error.name,
        message: error.message,
        metadata: {
          sourceIdentity: parsed.data.sourceIdentity,
          listenerIdentity: parsed.data.listenerIdentity,
          requestedSourceLanguage: parsed.data.sourceLanguage,
          targetLanguage: language,
          actorType: access.actor.type,
        },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Invalid translation token request" }, { status: 400 });
  }

  const recentTokenCount = await countRecentIssuedTokens({
    admin,
    meetingId: access.meeting.id,
    listenerIdentity: parsed.data.listenerIdentity,
  });

  try {
    assertTranslationTokenRateLimit({ issuedCount: recentTokenCount });
  } catch (error) {
    if (error instanceof TranslationTokenRateLimitError) {
      await logOperationalEvent({
        supabase: admin,
        meetingId: access.meeting.id,
        roomName: access.meeting.livekit_room_name,
        featureArea: "translation",
        eventType: "translation_token_rate_limited",
        severity: "warning",
        errorType: error.name,
        message: error.message,
        metadata: {
          sourceIdentity: parsed.data.sourceIdentity,
          listenerIdentity: parsed.data.listenerIdentity,
          sourceLanguage,
          targetLanguage: language,
          recentTokenCount,
        },
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const env = getServerEnv();
  const translationRequest = buildTranslationClientSecretRequest({
    apiKey: requireEnv("OPENAI_API_KEY"),
    language,
    sourceLanguage,
    inputTranscriptionEnabled: parsed.data.inputTranscriptionEnabled,
    inputTranscriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
    noiseReductionEnabled: parsed.data.noiseReductionEnabled,
    model: env.OPENAI_TRANSLATION_MODEL,
  });

  const response = await fetch(translationRequest.url, translationRequest.init);

  if (!response.ok) {
    const errorText = await response.text();
    await logOperationalEvent({
      supabase: admin,
      meetingId: access.meeting.id,
      roomName: access.meeting.livekit_room_name,
      featureArea: "translation",
      eventType: "translation_token_openai_failed",
      severity: "error",
      errorType: "openai_client_secret_error",
      message: "OpenAI realtime translation client secret request failed.",
      metadata: {
        sourceIdentity: parsed.data.sourceIdentity,
        listenerIdentity: parsed.data.listenerIdentity,
        sourceLanguage,
        targetLanguage: language,
        upstreamStatus: response.status,
        upstreamBody: errorText,
      },
    });
    return NextResponse.json({ error: errorText }, { status: response.status });
  }

  const data = (await response.json()) as ClientSecretResponse;
  const clientSecret = data.value ?? data.client_secret?.value;

  if (!clientSecret) {
    await logOperationalEvent({
      supabase: admin,
      meetingId: access.meeting.id,
      roomName: access.meeting.livekit_room_name,
      featureArea: "translation",
      eventType: "translation_token_openai_malformed",
      severity: "error",
      errorType: "openai_client_secret_malformed",
      message: "Realtime translation client secret response was missing value.",
      metadata: {
        sourceIdentity: parsed.data.sourceIdentity,
        listenerIdentity: parsed.data.listenerIdentity,
        sourceLanguage,
        targetLanguage: language,
      },
    });
    return NextResponse.json({ error: "Realtime translation client secret response was missing value" }, { status: 502 });
  }

  await logOperationalEvent({
    supabase: admin,
    meetingId: access.meeting.id,
    roomName: access.meeting.livekit_room_name,
    featureArea: "translation",
    eventType: "translation_token_issued",
    message: "Browser fallback translation token issued.",
    metadata: {
      sourceIdentity: parsed.data.sourceIdentity,
      listenerIdentity: parsed.data.listenerIdentity,
      sourceLanguage,
      targetLanguage: language,
      actorType: access.actor.type,
      expiresAt: data.expires_at ?? data.client_secret?.expires_at ?? null,
    },
  });

  return NextResponse.json({
    clientSecret,
    expiresAt: data.expires_at ?? data.client_secret?.expires_at ?? null,
  });
}


function buildListenerParticipantQuery({
  admin,
  meetingId,
  listenerIdentity,
  actor,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  meetingId: string;
  listenerIdentity: string;
  actor: MeetingActor;
}) {
  const query = admin
    .from("rt_meeting_participants")
    .select("livekit_identity, listening_language, status")
    .eq("meeting_id", meetingId)
    .eq("livekit_identity", listenerIdentity);

  const scopedQuery =
    actor.type === "host"
      ? query.eq("host_user_id", actor.userId)
      : query.eq("guest_session_id", actor.guestSessionId);

  return scopedQuery.maybeSingle<ListenerParticipantRow>();
}


async function countRecentIssuedTokens({
  admin,
  meetingId,
  listenerIdentity,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  meetingId: string;
  listenerIdentity: string;
}) {
  const { data, error } = await admin
    .from("rt_operational_events")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("event_type", "translation_token_issued")
    .gte("occurred_at", getTranslationTokenWindowStart())
    .contains("metadata", { listenerIdentity })
    .limit(50)
    .returns<TokenEventRow[]>();

  if (error) {
    return 0;
  }

  return data?.length ?? 0;
}
