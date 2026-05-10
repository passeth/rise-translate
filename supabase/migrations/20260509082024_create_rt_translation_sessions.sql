create type public.rt_translation_session_status as enum (
  'idle',
  'starting',
  'connected',
  'reconnecting',
  'failed',
  'stopped'
);

create table public.rt_translation_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.rt_meetings(id) on delete cascade,
  source_participant_id uuid references public.rt_meeting_participants(id) on delete set null,
  source_identity text not null,
  source_language public.rt_language_code not null,
  target_language public.rt_language_code not null,
  target_track_name text not null,
  status public.rt_translation_session_status not null default 'starting',
  openai_model text not null,
  livekit_room_name text not null,
  last_error text,
  connected_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rt_translation_sessions_no_same_language check (source_language <> target_language)
);

create index rt_translation_sessions_meeting_status_idx on public.rt_translation_sessions (meeting_id, status);
create index rt_translation_sessions_source_target_idx on public.rt_translation_sessions (meeting_id, source_identity, target_language);

alter table public.rt_translation_sessions enable row level security;

create policy "Hosts can read translation sessions for own rt_meetings"
  on public.rt_translation_sessions for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_translation_sessions.meeting_id and m.host_id = auth.uid()
  ));

-- Inserts/updates are service-role only via trusted server routes/workers.
