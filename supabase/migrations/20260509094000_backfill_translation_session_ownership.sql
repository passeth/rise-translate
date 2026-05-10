-- Backfill ownership markers introduced after the initial translation-session schema.
-- Older server-router rows were inserted with worker_id null and no heartbeat until claimed.
-- Older browser-fallback rows wrote a heartbeat from the public status route.
update public.rt_translation_sessions
set worker_id = 'server-pending'
where worker_id is null
  and status in ('starting', 'reconnecting')
  and worker_heartbeat_at is null;

update public.rt_translation_sessions
set worker_id = 'browser-fallback'
where worker_id is null;
