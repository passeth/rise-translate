-- Support public write rate-limit lookups without scanning all meeting rows.
create index if not exists rt_chat_messages_participant_sent_idx
  on public.rt_chat_messages (meeting_id, participant_id, sent_at desc);

create index if not exists rt_transcript_segments_speaker_created_idx
  on public.rt_transcript_segments (meeting_id, speaker_participant_id, created_at desc);
