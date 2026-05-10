-- EVAS realtime translation meeting app initial schema.

create extension if not exists pgcrypto;

create type public.rt_language_code as enum ('ko', 'en', 'zh', 'ja', 'ru', 'vi');
create type public.rt_meeting_lifecycle_status as enum ('scheduled', 'in_progress', 'ended', 'cancelled');
create type public.rt_notes_status as enum ('none', 'generating', 'complete', 'failed');
create type public.rt_recording_status as enum ('off', 'active', 'processing', 'available', 'expired', 'deleted', 'failed');
create type public.rt_guest_session_status as enum ('created', 'active', 'left', 'expired', 'replaced', 'blocked');
create type public.rt_participant_status as enum ('joining', 'active', 'left', 'disconnected', 'removed');
create type public.rt_participant_role as enum ('host', 'guest');

create table public.rt_host_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  company text not null default 'EVAS',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rt_meetings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.rt_host_profiles(id) on delete restrict,
  title text not null,
  scheduled_start_at timestamptz not null,
  buyer_company text not null,
  memo text,
  public_token text not null unique,
  livekit_room_name text not null unique,
  lifecycle_status public.rt_meeting_lifecycle_status not null default 'scheduled',
  notes_status public.rt_notes_status not null default 'none',
  recording_status public.rt_recording_status not null default 'off',
  started_at timestamptz,
  ended_at timestamptz,
  link_disabled_at timestamptz,
  empty_since_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rt_meetings_title_not_blank check (length(trim(title)) > 0),
  constraint rt_meetings_buyer_company_not_blank check (length(trim(buyer_company)) > 0),
  constraint rt_meetings_public_token_not_short check (length(public_token) >= 24)
);

create table public.rt_meeting_access_secrets (
  meeting_id uuid primary key references public.rt_meetings(id) on delete cascade,
  password_encrypted text not null,
  password_hash text not null,
  password_hash_alg text not null default 'sha256-pepper-v1',
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table public.rt_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.rt_meetings(id) on delete cascade,
  display_name text not null,
  company text not null,
  speaking_language public.rt_language_code not null,
  listening_language public.rt_language_code not null,
  consent_translation boolean not null default false,
  consent_captions boolean not null default false,
  consent_transcription boolean not null default false,
  consent_notes boolean not null default false,
  consent_possible_recording boolean not null default false,
  consent_internal_use boolean not null default false,
  consented_at timestamptz,
  session_token_hash text not null unique,
  status public.rt_guest_session_status not null default 'created',
  joined_at timestamptz,
  left_at timestamptz,
  last_seen_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint rt_guest_sessions_name_not_blank check (length(trim(display_name)) > 0),
  constraint rt_guest_sessions_company_not_blank check (length(trim(company)) > 0),
  constraint rt_guest_sessions_all_consents check (
    consent_translation and consent_captions and consent_transcription and
    consent_notes and consent_possible_recording and consent_internal_use
  )
);

create table public.rt_meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.rt_meetings(id) on delete cascade,
  host_user_id uuid references auth.users(id) on delete cascade,
  guest_session_id uuid references public.rt_guest_sessions(id) on delete cascade,
  role public.rt_participant_role not null,
  display_name text not null,
  company text not null,
  speaking_language public.rt_language_code,
  listening_language public.rt_language_code,
  livekit_identity text not null unique,
  status public.rt_participant_status not null default 'joining',
  joined_at timestamptz,
  left_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rt_meeting_participants_one_identity check (
    (host_user_id is not null and guest_session_id is null and role = 'host') or
    (host_user_id is null and guest_session_id is not null and role = 'guest')
  ),
  constraint rt_meeting_participants_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint rt_meeting_participants_company_not_blank check (length(trim(company)) > 0)
);

create table public.rt_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.rt_meetings(id) on delete cascade,
  speaker_participant_id uuid references public.rt_meeting_participants(id) on delete set null,
  sequence bigint not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source_language public.rt_language_code not null,
  source_text text not null,
  korean_text text not null,
  is_final boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (meeting_id, sequence)
);

create table public.rt_meeting_notes (
  meeting_id uuid primary key references public.rt_meetings(id) on delete cascade,
  status public.rt_notes_status not null default 'none',
  markdown text,
  summary_ko text,
  decisions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  generated_at timestamptz,
  failed_reason text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rt_chat_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.rt_meetings(id) on delete cascade,
  participant_id uuid references public.rt_meeting_participants(id) on delete set null,
  body text not null,
  sent_at timestamptz not null default now(),
  client_message_id text,
  created_at timestamptz not null default now(),
  constraint rt_chat_messages_body_not_blank check (length(trim(body)) > 0)
);

create table public.rt_recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.rt_meetings(id) on delete cascade,
  started_by_host_id uuid references auth.users(id) on delete set null,
  livekit_egress_id text,
  storage_provider text not null default 'supabase',
  bucket text,
  object_key text,
  status public.rt_recording_status not null default 'off',
  started_at timestamptz,
  stopped_at timestamptz,
  available_at timestamptz,
  expires_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rt_meetings_host_scheduled_idx on public.rt_meetings (host_id, scheduled_start_at desc);
create index rt_meetings_host_lifecycle_scheduled_idx on public.rt_meetings (host_id, lifecycle_status, scheduled_start_at desc);
create index rt_meetings_host_buyer_company_idx on public.rt_meetings (host_id, buyer_company);
create index rt_guest_sessions_meeting_status_idx on public.rt_guest_sessions (meeting_id, status);
create index rt_meeting_participants_meeting_status_idx on public.rt_meeting_participants (meeting_id, status);
create index rt_transcript_segments_meeting_started_idx on public.rt_transcript_segments (meeting_id, started_at);
create index rt_chat_messages_meeting_sent_idx on public.rt_chat_messages (meeting_id, sent_at);
create index rt_recordings_meeting_status_idx on public.rt_recordings (meeting_id, status);
create index rt_recordings_available_expiry_idx on public.rt_recordings (expires_at) where status = 'available';

alter table public.rt_host_profiles enable row level security;
alter table public.rt_meetings enable row level security;
alter table public.rt_meeting_access_secrets enable row level security;
alter table public.rt_guest_sessions enable row level security;
alter table public.rt_meeting_participants enable row level security;
alter table public.rt_transcript_segments enable row level security;
alter table public.rt_meeting_notes enable row level security;
alter table public.rt_chat_messages enable row level security;
alter table public.rt_recordings enable row level security;

create policy "Hosts can read own profile"
  on public.rt_host_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Hosts can update own profile"
  on public.rt_host_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Hosts can read own rt_meetings"
  on public.rt_meetings for select
  to authenticated
  using (host_id = auth.uid());

create policy "Hosts can read participants for own rt_meetings"
  on public.rt_meeting_participants for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_meeting_participants.meeting_id and m.host_id = auth.uid()
  ));

create policy "Hosts can read transcripts for own rt_meetings"
  on public.rt_transcript_segments for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_transcript_segments.meeting_id and m.host_id = auth.uid()
  ));

create policy "Hosts can read notes for own rt_meetings"
  on public.rt_meeting_notes for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_meeting_notes.meeting_id and m.host_id = auth.uid()
  ));

create policy "Hosts can read chat for own rt_meetings"
  on public.rt_chat_messages for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_chat_messages.meeting_id and m.host_id = auth.uid()
  ));

create policy "Hosts can read rt_recordings for own rt_meetings"
  on public.rt_recordings for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_recordings.meeting_id and m.host_id = auth.uid()
  ));

-- No browser-readable policy is created for rt_meeting_access_secrets or rt_guest_sessions.
-- Secret-bearing and guest operations must go through trusted server routes using service role.
