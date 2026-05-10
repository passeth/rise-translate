-- Keep one active translation lane per meeting/source/target even under concurrent start requests.
with duplicate_active_lanes as (
  select
    id,
    row_number() over (
      partition by meeting_id, source_identity, target_language
      order by updated_at desc, created_at desc, id desc
    ) as lane_rank
  from public.rt_translation_sessions
  where status in ('starting', 'connected', 'reconnecting')
)
update public.rt_translation_sessions
set status = 'stopped', stopped_at = now(), updated_at = now()
where id in (select id from duplicate_active_lanes where lane_rank > 1);

create unique index if not exists rt_translation_sessions_one_active_lane_idx
  on public.rt_translation_sessions (meeting_id, source_identity, target_language)
  where status in ('starting', 'connected', 'reconnecting');
