create table public.voice_recordings (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'eslam-voice-recordings',
  storage_path text not null,
  status text not null default 'pending',
  mime_type text not null,
  size_bytes bigint,
  duration_ms integer,
  created_at timestamptz not null default timezone('utc', now()),
  uploaded_at timestamptz,
  constraint voice_recordings_storage_location_unique unique (storage_bucket, storage_path),
  constraint voice_recordings_storage_bucket_check check (storage_bucket = 'eslam-voice-recordings'),
  constraint voice_recordings_status_check check (status in ('pending', 'uploaded')),
  constraint voice_recordings_mime_type_check check (
    mime_type in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav')
  ),
  constraint voice_recordings_size_check check (
    size_bytes is null or (size_bytes > 0 and size_bytes <= 26214400)
  ),
  constraint voice_recordings_duration_check check (
    duration_ms is null or (duration_ms > 0 and duration_ms <= 3600000)
  ),
  constraint voice_recordings_uploaded_state_check check (
    (status = 'pending' and uploaded_at is null and size_bytes is null and duration_ms is null)
    or
    (status = 'uploaded' and uploaded_at is not null and size_bytes is not null and duration_ms is not null)
  )
);

create index voice_recordings_owner_created_idx
  on public.voice_recordings (created_by, created_at desc);

alter table public.voice_recordings enable row level security;

revoke all on table public.voice_recordings from public, anon, authenticated;
grant select, insert, update, delete on table public.voice_recordings to service_role;

comment on table public.voice_recordings is
  'Admin-only voice capture metadata. Audio bytes live in the private eslam-voice-recordings Storage bucket.';

comment on column public.voice_recordings.storage_path is
  'Server-generated immutable path scoped by the admin user id and recording id.';

comment on column public.voice_recordings.status is
  'pending while a signed upload is in flight; uploaded only after server-side Storage verification.';

do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $bucket$
      insert into storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
      )
      values (
        'eslam-voice-recordings',
        'eslam-voice-recordings',
        false,
        26214400,
        array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']::text[]
      )
      on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types
    $bucket$;
  end if;
end;
$$;
