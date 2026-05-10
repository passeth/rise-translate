import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

type SchemaProbe = {
  table: string;
  columns: string[];
};

const probes: SchemaProbe[] = [
  {
    table: "rt_host_profiles",
    columns: ["id", "display_name", "company", "is_active", "created_at", "updated_at"],
  },
  {
    table: "rt_meetings",
    columns: [
      "id",
      "host_id",
      "title",
      "public_token",
      "livekit_room_name",
      "lifecycle_status",
      "notes_status",
      "recording_status",
      "empty_since_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "rt_meeting_access_secrets",
    columns: ["meeting_id", "password_encrypted", "password_hash", "password_hash_alg", "created_at"],
  },
  {
    table: "rt_guest_sessions",
    columns: [
      "id",
      "meeting_id",
      "display_name",
      "company",
      "speaking_language",
      "listening_language",
      "session_token_hash",
      "status",
      "last_seen_at",
      "created_at",
    ],
  },
  {
    table: "rt_meeting_participants",
    columns: [
      "id",
      "meeting_id",
      "host_user_id",
      "guest_session_id",
      "role",
      "display_name",
      "company",
      "speaking_language",
      "listening_language",
      "livekit_identity",
      "status",
      "last_seen_at",
      "created_at",
    ],
  },
  {
    table: "rt_transcript_segments",
    columns: [
      "id",
      "meeting_id",
      "speaker_participant_id",
      "sequence",
      "started_at",
      "ended_at",
      "source_language",
      "source_text",
      "korean_text",
      "is_final",
      "metadata",
      "created_at",
    ],
  },
  {
    table: "rt_meeting_notes",
    columns: [
      "meeting_id",
      "status",
      "markdown",
      "summary_ko",
      "decisions",
      "action_items",
      "open_questions",
      "retry_count",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "rt_chat_messages",
    columns: ["id", "meeting_id", "participant_id", "body", "sent_at", "client_message_id", "created_at"],
  },
  {
    table: "rt_recordings",
    columns: [
      "id",
      "meeting_id",
      "started_by_host_id",
      "livekit_egress_id",
      "storage_provider",
      "bucket",
      "object_key",
      "status",
      "started_at",
      "stopped_at",
      "available_at",
      "expires_at",
      "deleted_at",
      "metadata",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "rt_translation_sessions",
    columns: [
      "id",
      "meeting_id",
      "source_participant_id",
      "source_identity",
      "source_language",
      "target_language",
      "target_track_name",
      "status",
      "openai_model",
      "livekit_room_name",
      "last_error",
      "connected_at",
      "stopped_at",
      "worker_id",
      "worker_claimed_at",
      "worker_heartbeat_at",
      "media_format",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "rt_operational_events",
    columns: [
      "id",
      "meeting_id",
      "room_name",
      "feature_area",
      "event_type",
      "severity",
      "error_type",
      "message",
      "metadata",
      "occurred_at",
      "created_at",
    ],
  },
  {
    table: "rt_usage_snapshots",
    columns: [
      "id",
      "meeting_id",
      "room_name",
      "captured_at",
      "reason",
      "meeting_duration_seconds",
      "active_participant_count",
      "total_participant_count",
      "recording_duration_seconds",
      "translation_session_count",
      "translation_connected_count",
      "translation_failed_count",
      "translation_channel_activity",
      "metadata",
      "created_at",
    ],
  },
];

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Supabase schema smoke: probing ${probes.length} rt_* tables.`);

  const failures: string[] = [];

  for (const probe of probes) {
    const { error } = await supabase
      .from(probe.table)
      .select(probe.columns.join(","))
      .limit(1);

    if (error) {
      failures.push(`${probe.table}: ${error.message}`);
      console.log(`- [failed] ${probe.table}`);
    } else {
      console.log(`- [ok] ${probe.table}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nSchema smoke failed. Apply supabase/migrations/ to the target project, then rerun this command.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nSchema smoke passed. Required rt_* tables and columns are visible to the service role.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Supabase schema smoke failed.");
  process.exitCode = 1;
});
