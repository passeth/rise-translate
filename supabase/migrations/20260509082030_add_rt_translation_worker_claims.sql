alter table public.rt_translation_sessions
  add column worker_id text,
  add column worker_claimed_at timestamptz,
  add column worker_heartbeat_at timestamptz,
  add column media_format jsonb not null default '{"encoding":"pcm16","sampleRate":24000,"channels":1}'::jsonb;

create index rt_translation_sessions_worker_claim_idx
  on public.rt_translation_sessions (status, worker_claimed_at)
  where status in ('starting', 'reconnecting');
