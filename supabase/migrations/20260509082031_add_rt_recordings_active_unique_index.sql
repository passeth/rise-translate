-- Prevent concurrent/duplicate active recording jobs for the same meeting.
create unique index if not exists rt_recordings_one_blocking_per_meeting_idx
  on public.rt_recordings (meeting_id)
  where status in ('active', 'processing');
