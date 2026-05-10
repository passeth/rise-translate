-- Operational observability and usage accounting for EVAS realtime translation meetings.

create table public.rt_operational_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.rt_meetings(id) on delete cascade,
  room_name text,
  feature_area text not null,
  event_type text not null,
  severity text not null default 'info',
  error_type text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint rt_operational_events_feature_area check (
    feature_area in ('meeting', 'translation', 'captions', 'recording', 'notes', 'cleanup', 'livekit')
  ),
  constraint rt_operational_events_severity check (severity in ('info', 'warning', 'error')),
  constraint rt_operational_events_event_type_not_blank check (length(trim(event_type)) > 0)
);

create table public.rt_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.rt_meetings(id) on delete cascade,
  room_name text not null,
  captured_at timestamptz not null default now(),
  reason text not null,
  meeting_duration_seconds integer not null default 0,
  active_participant_count integer not null default 0,
  total_participant_count integer not null default 0,
  recording_duration_seconds integer not null default 0,
  translation_session_count integer not null default 0,
  translation_connected_count integer not null default 0,
  translation_failed_count integer not null default 0,
  translation_channel_activity jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint rt_usage_snapshots_reason_not_blank check (length(trim(reason)) > 0),
  constraint rt_usage_snapshots_non_negative check (
    meeting_duration_seconds >= 0 and
    active_participant_count >= 0 and
    total_participant_count >= 0 and
    recording_duration_seconds >= 0 and
    translation_session_count >= 0 and
    translation_connected_count >= 0 and
    translation_failed_count >= 0
  )
);

create index rt_operational_events_meeting_time_idx on public.rt_operational_events (meeting_id, occurred_at desc);
create index rt_operational_events_feature_severity_idx on public.rt_operational_events (feature_area, severity, occurred_at desc);
create index rt_usage_snapshots_meeting_time_idx on public.rt_usage_snapshots (meeting_id, captured_at desc);

alter table public.rt_operational_events enable row level security;
alter table public.rt_usage_snapshots enable row level security;

create policy "Hosts can read operational events for own rt_meetings"
  on public.rt_operational_events for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_operational_events.meeting_id and m.host_id = auth.uid()
  ));

create policy "Hosts can read usage snapshots for own rt_meetings"
  on public.rt_usage_snapshots for select
  to authenticated
  using (exists (
    select 1 from public.rt_meetings m
    where m.id = rt_usage_snapshots.meeting_id and m.host_id = auth.uid()
  ));

-- Inserts are service-role only via trusted server routes/workers.
