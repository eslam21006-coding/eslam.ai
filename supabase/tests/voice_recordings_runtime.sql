begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'voice-admin@example.com',
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform 1 from public.voice_recordings;
    raise exception 'authenticated role unexpectedly read voice recordings';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;

set local role anon;
do $$
begin
  begin
    insert into public.voice_recordings (
      created_by,
      storage_path,
      mime_type
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webm',
      'audio/webm'
    );
    raise exception 'anon role unexpectedly inserted a voice recording';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;
reset role;

set local role service_role;

insert into public.voice_recordings (
  id,
  created_by,
  storage_path,
  mime_type
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webm',
  'audio/webm'
);

do $$
begin
  if not exists (
    select 1
    from public.voice_recordings
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'pending'
      and storage_bucket = 'eslam-voice-recordings'
      and size_bytes is null
      and duration_ms is null
      and uploaded_at is null
  ) then
    raise exception 'pending voice recording was not created with the expected state';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.voice_recordings (
      created_by,
      storage_path,
      mime_type
    )
    values (
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.exe',
      'application/octet-stream'
    );
    raise exception 'invalid MIME type unexpectedly succeeded';
  exception
    when check_violation then
      null;
  end;
end;
$$;

do $$
begin
  begin
    update public.voice_recordings
    set status = 'uploaded',
        size_bytes = 26214401,
        duration_ms = 1000,
        uploaded_at = now()
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'oversized recording unexpectedly succeeded';
  exception
    when check_violation then
      null;
  end;
end;
$$;

update public.voice_recordings
set status = 'uploaded',
    size_bytes = 1048576,
    duration_ms = 65000,
    uploaded_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
begin
  if not exists (
    select 1
    from public.voice_recordings
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'uploaded'
      and size_bytes = 1048576
      and duration_ms = 65000
      and uploaded_at is not null
  ) then
    raise exception 'uploaded voice recording was not finalized correctly';
  end if;
end;
$$;

reset role;
rollback;
