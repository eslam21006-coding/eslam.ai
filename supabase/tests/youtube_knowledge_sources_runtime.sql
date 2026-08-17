begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '55555555-5555-4555-8555-555555555555',
  'authenticated',
  'authenticated',
  'youtube-source-admin@example.com',
  now(),
  now()
);

set local role authenticated;
do $$
begin
  begin
    perform 1 from public.youtube_transcript_imports;
    raise exception 'authenticated unexpectedly read YouTube transcript staging';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role anon;
do $$
begin
  begin
    insert into public.youtube_transcript_imports (
      created_by,
      video_id,
      canonical_url,
      video_title,
      provider_job_id
    ) values (
      '55555555-5555-4555-8555-555555555555',
      'dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'Blocked anon import',
      'job_anon'
    );
    raise exception 'anon unexpectedly inserted YouTube transcript staging';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role service_role;

insert into public.knowledge_sources (
  id,
  created_by,
  storage_path,
  title,
  original_filename,
  mime_type,
  declared_size_bytes,
  source_kind,
  source_url,
  external_source_id,
  source_language
) values (
  '55555555-5555-4555-8555-555555555556',
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555/55555555-5555-4555-8555-555555555556.txt',
  'YouTube reference',
  'youtube-dQw4w9WgXcQ-en.txt',
  'text/plain',
  1024,
  'youtube_transcript',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'dQw4w9WgXcQ',
  'en'
);

insert into public.knowledge_sources (
  id,
  created_by,
  storage_path,
  title,
  original_filename,
  mime_type,
  declared_size_bytes
) values (
  '55555555-5555-4555-8555-555555555557',
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555/55555555-5555-4555-8555-555555555557.txt',
  'Document reference',
  'document.txt',
  'text/plain',
  512
);

do $$
begin
  if not exists (
    select 1
    from public.knowledge_sources
    where id = '55555555-5555-4555-8555-555555555556'
      and source_kind = 'youtube_transcript'
      and source_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      and external_source_id = 'dQw4w9WgXcQ'
      and source_language = 'en'
      and status = 'pending'
  ) then
    raise exception 'valid YouTube Knowledge provenance was not persisted';
  end if;

  if not exists (
    select 1
    from public.knowledge_sources
    where id = '55555555-5555-4555-8555-555555555557'
      and source_kind = 'document'
      and source_url is null
      and external_source_id is null
      and source_language is null
  ) then
    raise exception 'existing document provenance default changed unexpectedly';
  end if;

  begin
    insert into public.knowledge_sources (
      created_by,
      storage_path,
      title,
      original_filename,
      mime_type,
      declared_size_bytes,
      source_kind,
      source_url,
      external_source_id
    ) values (
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555/invalid-youtube.txt',
      'Invalid YouTube',
      'invalid-youtube.txt',
      'text/plain',
      100,
      'youtube_transcript',
      'https://example.com/watch?v=dQw4w9WgXcQ',
      'dQw4w9WgXcQ'
    );
    raise exception 'invalid canonical YouTube URL unexpectedly passed provenance constraint';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.knowledge_sources (
      created_by,
      storage_path,
      title,
      original_filename,
      mime_type,
      declared_size_bytes,
      source_kind,
      source_url,
      external_source_id
    ) values (
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555/duplicate-youtube.txt',
      'Duplicate YouTube',
      'duplicate-youtube.txt',
      'text/plain',
      100,
      'youtube_transcript',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'dQw4w9WgXcQ'
    );
    raise exception 'duplicate active YouTube video unexpectedly persisted twice';
  exception
    when unique_violation then null;
  end;
end;
$$;

insert into public.youtube_transcript_imports (
  id,
  created_by,
  video_id,
  canonical_url,
  requested_language,
  video_title,
  channel_name,
  provider_job_id
) values (
  '55555555-5555-4555-8555-555555555558',
  '55555555-5555-4555-8555-555555555555',
  'M7lc1UVf-VE',
  'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  'en',
  'Async YouTube transcript',
  'YouTube Developers',
  'job_test_123'
);

do $$
begin
  if not exists (
    select 1 from public.youtube_transcript_imports
    where id = '55555555-5555-4555-8555-555555555558'
      and status = 'processing'
      and last_error_code is null
  ) then
    raise exception 'YouTube transcript staging did not begin processing';
  end if;

  begin
    insert into public.youtube_transcript_imports (
      created_by,
      video_id,
      canonical_url,
      video_title,
      provider_job_id
    ) values (
      '66666666-6666-4666-8666-666666666666',
      'abcdefghijk',
      'https://www.youtube.com/watch?v=abcdefghijk',
      'Orphaned YouTube import',
      'job_orphan'
    );
    raise exception 'YouTube staging unexpectedly accepted an unknown creator';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.youtube_transcript_imports
    set status = 'failed', last_error_code = null
    where id = '55555555-5555-4555-8555-555555555558';
    raise exception 'failed YouTube staging without an error code unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$$;

reset role;
rollback;
