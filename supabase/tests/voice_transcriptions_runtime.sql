begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'voice-transcription-admin@example.com',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'other-user@example.com',
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
    perform 1 from public.voice_transcriptions;
    raise exception 'authenticated role unexpectedly read voice transcriptions';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.claim_voice_transcription(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'gpt-4o-transcribe',
      300
    );
    raise exception 'authenticated role unexpectedly executed transcription claim';
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
    insert into public.voice_transcriptions (
      voice_recording_id,
      created_by,
      status,
      model,
      processing_started_at,
      lease_expires_at,
      claim_token
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'processing',
      'gpt-4o-transcribe',
      now(),
      now() + interval '5 minutes',
      gen_random_uuid()
    );
    raise exception 'anon role unexpectedly inserted a voice transcription';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role service_role;

do $$
begin
  begin
    perform public.claim_voice_transcription(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'gpt-4o-transcribe',
      null
    );
    raise exception 'null transcription lease unexpectedly accepted';
  exception
    when others then
      if sqlerrm = 'null transcription lease unexpectedly accepted' then
        raise;
      end if;
      if position('invalid transcription lease' in sqlerrm) = 0 then
        raise exception 'null transcription lease returned unexpected error: %', sqlerrm;
      end if;
  end;
end;
$$;

insert into public.voice_recordings (
  id,
  created_by,
  storage_path,
  status,
  mime_type,
  size_bytes,
  duration_ms,
  uploaded_at
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webm',
    'uploaded',
    'audio/webm',
    1048576,
    65000,
    now()
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webm',
    'uploaded',
    'audio/webm',
    1048576,
    45000,
    now()
  );

create temporary table first_claim as
select * from public.claim_voice_transcription(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'gpt-4o-transcribe',
  300
);

do $$
begin
  if not exists (
    select 1 from first_claim
    where claim_state = 'claimed'
      and attempt_count = 1
      and transcription_id is not null
      and claim_token is not null
  ) then
    raise exception 'first transcription claim was not created correctly';
  end if;
end;
$$;

create temporary table busy_claim as
select * from public.claim_voice_transcription(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'gpt-4o-transcribe',
  300
);

do $$
begin
  if not exists (
    select 1 from busy_claim
    where claim_state = 'busy'
      and attempt_count = 1
  ) then
    raise exception 'active transcription lease did not prevent a duplicate claim';
  end if;
end;
$$;

create temporary table expiring_first_claim as
select * from public.claim_voice_transcription(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'gpt-4o-transcribe',
  300
);

update public.voice_transcriptions
set lease_expires_at = now() - interval '1 minute'
where voice_recording_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  and status = 'processing';

create temporary table expired_retry_claim as
select * from public.claim_voice_transcription(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'gpt-4o-transcribe',
  300
);

do $$
begin
  if not exists (
    select 1 from expired_retry_claim
    where claim_state = 'claimed'
      and attempt_count = 2
      and claim_token is not null
  ) then
    raise exception 'expired processing lease was not reclaimed';
  end if;

  if exists (
    select 1
    from expiring_first_claim first
    cross join expired_retry_claim retry
    where first.claim_token = retry.claim_token
  ) then
    raise exception 'expired lease retry did not rotate the worker token';
  end if;
end;
$$;

do $$
declare
  v_id uuid;
  v_token uuid;
  v_failed boolean;
begin
  select transcription_id, claim_token into v_id, v_token from first_claim;
  select public.fail_voice_transcription(
    v_id,
    '11111111-1111-4111-8111-111111111111',
    v_token,
    'test-failure'
  ) into v_failed;

  if v_failed is distinct from true then
    raise exception 'owned transcription attempt did not transition to failed';
  end if;
end;
$$;

create temporary table retry_claim as
select * from public.claim_voice_transcription(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'gpt-4o-transcribe',
  300
);

do $$
begin
  if not exists (
    select 1 from retry_claim
    where claim_state = 'claimed'
      and attempt_count = 2
      and claim_token is not null
  ) then
    raise exception 'failed transcription was not reclaimed as attempt two';
  end if;

  if exists (
    select 1
    from first_claim first
    cross join retry_claim retry
    where first.claim_token = retry.claim_token
  ) then
    raise exception 'retry did not rotate the transcription claim token';
  end if;
end;
$$;

do $$
declare
  v_id uuid;
  v_old_token uuid;
  v_new_token uuid;
  v_stale_completed boolean;
  v_completed boolean;
begin
  select transcription_id, claim_token into v_id, v_old_token from first_claim;
  select claim_token into v_new_token from retry_claim;

  select public.complete_voice_transcription(
    v_id,
    '11111111-1111-4111-8111-111111111111',
    v_old_token,
    'stale worker transcript'
  ) into v_stale_completed;

  if v_stale_completed is distinct from false then
    raise exception 'stale transcription worker unexpectedly completed a newer attempt';
  end if;

  select public.complete_voice_transcription(
    v_id,
    '11111111-1111-4111-8111-111111111111',
    v_new_token,
    'النص النهائي Meta Ads CAC funnel'
  ) into v_completed;

  if v_completed is distinct from true then
    raise exception 'current transcription claim failed to complete';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from public.voice_transcriptions
    where voice_recording_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and created_by = '11111111-1111-4111-8111-111111111111'
      and status = 'completed'
      and attempt_count = 2
      and transcript_text = 'النص النهائي Meta Ads CAC funnel'
      and claim_token is null
      and lease_expires_at is null
      and completed_at is not null
  ) then
    raise exception 'completed transcription state is incorrect';
  end if;

  begin
    update public.voice_transcriptions
    set transcript_text = 'mutated transcript'
    where voice_recording_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'completed transcript unexpectedly mutated';
  exception
    when others then
      if sqlerrm = 'completed transcript unexpectedly mutated' then
        raise;
      end if;
  end;
end;
$$;

create temporary table completed_claim as
select * from public.claim_voice_transcription(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'gpt-4o-transcribe',
  300
);

do $$
begin
  if not exists (
    select 1 from completed_claim
    where claim_state = 'completed'
      and attempt_count = 2
      and transcript_text = 'النص النهائي Meta Ads CAC funnel'
  ) then
    raise exception 'completed transcription was not idempotently returned';
  end if;
end;
$$;

insert into public.voice_recordings (
  id,
  created_by,
  storage_path,
  mime_type
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webm',
  'audio/webm'
);

create temporary table pending_claim as
select * from public.claim_voice_transcription(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'gpt-4o-transcribe',
  300
);

do $$
begin
  if not exists (select 1 from pending_claim where claim_state = 'not_found') then
    raise exception 'pending source recording unexpectedly became transcribable';
  end if;
end;
$$;

create temporary table wrong_owner_claim as
select * from public.claim_voice_transcription(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'gpt-4o-transcribe',
  300
);

do $$
begin
  if not exists (select 1 from wrong_owner_claim where claim_state = 'not_found') then
    raise exception 'wrong owner unexpectedly claimed a transcription';
  end if;
end;
$$;

reset role;
rollback;
