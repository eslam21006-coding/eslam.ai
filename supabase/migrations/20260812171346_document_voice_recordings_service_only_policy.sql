create policy voice_recordings_no_direct_client_access
on public.voice_recordings
for all
to anon, authenticated
using (false)
with check (false);

comment on policy voice_recordings_no_direct_client_access on public.voice_recordings is
  'Voice capture metadata is deliberately service-only. Browser uploads use signed Storage tokens and never access this table directly.';
