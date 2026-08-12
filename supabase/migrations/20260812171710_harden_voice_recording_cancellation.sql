alter table public.voice_recordings
  drop constraint voice_recordings_status_check,
  drop constraint voice_recordings_uploaded_state_check;

alter table public.voice_recordings
  add constraint voice_recordings_status_check
    check (status in ('pending', 'cancelling', 'uploaded')),
  add constraint voice_recordings_uploaded_state_check
    check (
      (status in ('pending', 'cancelling') and uploaded_at is null and size_bytes is null and duration_ms is null)
      or
      (status = 'uploaded' and uploaded_at is not null and size_bytes is not null and duration_ms is not null)
    );

comment on column public.voice_recordings.status is
  'pending while upload/finalization may proceed; cancelling after an atomic cleanup claim; uploaded only after server-side Storage verification.';
