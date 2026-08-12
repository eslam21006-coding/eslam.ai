begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '31111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'voice-teaching-audit@example.com',
  now(),
  now()
);

set local role service_role;

insert into public.voice_recordings (
  id,
  created_by,
  storage_path,
  status,
  mime_type,
  size_bytes,
  duration_ms,
  uploaded_at
) values (
  '31000000-0000-4000-8000-000000000001',
  '31111111-1111-4111-8111-111111111111',
  '31111111-1111-4111-8111-111111111111/audit.webm',
  'uploaded',
  'audio/webm',
  1000,
  10000,
  now()
);

insert into public.voice_transcriptions (
  id,
  voice_recording_id,
  created_by,
  status,
  model,
  transcript_text,
  processing_started_at,
  completed_at
) values (
  '32000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '31111111-1111-4111-8111-111111111111',
  'completed',
  'gpt-4o-transcribe',
  'Immutable audit transcript.',
  now() - interval '1 minute',
  now()
);

insert into public.voice_teaching_extractions (
  id,
  voice_transcription_id,
  voice_recording_id,
  created_by,
  status,
  model,
  processing_started_at,
  completed_at
) values (
  '33000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '31111111-1111-4111-8111-111111111111',
  'completed',
  'gpt-5-mini',
  now() - interval '30 seconds',
  now()
);

do $$
begin
  begin
    update public.voice_teaching_extractions
    set model = 'mutated-model'
    where id = '33000000-0000-4000-8000-000000000001';
    raise exception 'completed extraction unexpectedly mutated';
  exception
    when others then
      if sqlerrm = 'completed extraction unexpectedly mutated' then raise; end if;
      if position('completed voice teaching extractions are immutable' in sqlerrm) = 0 then
        raise exception 'completed extraction update returned unexpected error: %', sqlerrm;
      end if;
  end;

  begin
    delete from public.voice_teaching_extractions
    where id = '33000000-0000-4000-8000-000000000001';
    raise exception 'service_role unexpectedly deleted completed extraction';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  begin
    delete from public.voice_teaching_extractions
    where id = '33000000-0000-4000-8000-000000000001';
    raise exception 'postgres unexpectedly deleted completed extraction';
  exception
    when others then
      if sqlerrm = 'postgres unexpectedly deleted completed extraction' then raise; end if;
      if position('completed voice teaching extractions are immutable' in sqlerrm) = 0 then
        raise exception 'completed extraction delete returned unexpected error: %', sqlerrm;
      end if;
  end;
end;
$$;

rollback;
