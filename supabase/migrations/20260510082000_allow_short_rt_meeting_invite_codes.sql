-- Allow short human-friendly invite codes while preserving existing long links.

alter table public.rt_meetings
  drop constraint if exists rt_meetings_public_token_not_short;

alter table public.rt_meetings
  add constraint rt_meetings_public_token_format check (
    public_token ~ '^m_[A-Z2-9]{6}$'
    or length(public_token) >= 24
  );
