begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'voice-teaching-admin@example.com',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'voice-teaching-other@example.com',
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
    perform 1 from public.voice_teaching_extractions;
    raise exception 'authenticated role unexpectedly read voice teaching extractions';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.claim_voice_teaching_extraction(
      '20000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      'gpt-5-mini',
      1,
      150
    );
    raise exception 'authenticated role unexpectedly executed voice teaching claim';
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
    perform 1 from public.voice_teaching_candidates;
    raise exception 'anon role unexpectedly read voice teaching candidates';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

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
) values
  (
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000001.webm',
    'uploaded',
    'audio/webm',
    1048576,
    60000,
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000002.webm',
    'uploaded',
    'audio/webm',
    1048576,
    45000,
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/10000000-0000-4000-8000-000000000003.webm',
    'uploaded',
    'audio/webm',
    1048576,
    30000,
    now()
  );

insert into public.voice_transcriptions (
  id,
  voice_recording_id,
  created_by,
  status,
  model,
  transcript_text,
  attempt_count,
  processing_started_at,
  completed_at
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'completed',
    'gpt-4o-transcribe',
    'Before scaling acquisition, fix the real bottleneck first. CAC is a diagnostic metric, not the business goal.',
    1,
    now() - interval '2 minutes',
    now() - interval '1 minute'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'completed',
    'gpt-4o-transcribe',
    'A second transcript used to verify expired extraction recovery.',
    1,
    now() - interval '2 minutes',
    now() - interval '1 minute'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    'completed',
    'gpt-4o-transcribe',
    'This transcript intentionally yields zero durable candidates.',
    1,
    now() - interval '2 minutes',
    now() - interval '1 minute'
  );

do $$
begin
  begin
    perform public.claim_voice_teaching_extraction(
      '20000000-0000-4000-8000-000000000001',
      '11111111-1111-4111-8111-111111111111',
      'gpt-5-mini',
      1,
      null
    );
    raise exception 'null voice teaching lease unexpectedly accepted';
  exception
    when others then
      if sqlerrm = 'null voice teaching lease unexpectedly accepted' then
        raise;
      end if;
      if position('invalid voice teaching lease' in sqlerrm) = 0 then
        raise exception 'null voice teaching lease returned unexpected error: %', sqlerrm;
      end if;
  end;
end;
$$;

create temporary table first_claim as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'gpt-5-mini',
  1,
  150
);

do $$
begin
  if not exists (
    select 1 from first_claim
    where claim_state = 'claimed'
      and attempt_count = 1
      and extraction_id is not null
      and claim_token is not null
  ) then
    raise exception 'first voice teaching claim was not created correctly';
  end if;
end;
$$;

create temporary table busy_claim as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'gpt-5-mini',
  1,
  150
);

do $$
begin
  if not exists (
    select 1 from busy_claim
    where claim_state = 'busy'
      and attempt_count = 1
  ) then
    raise exception 'active voice teaching lease did not prevent duplicate claim';
  end if;
end;
$$;

create temporary table expiring_claim as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'gpt-5-mini',
  1,
  150
);

update public.voice_teaching_extractions
set lease_expires_at = now() - interval '1 minute'
where voice_transcription_id = '20000000-0000-4000-8000-000000000002'
  and status = 'processing';

create temporary table expired_retry as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  'gpt-5-mini',
  1,
  150
);

do $$
begin
  if not exists (
    select 1 from expired_retry
    where claim_state = 'claimed'
      and attempt_count = 2
      and claim_token is not null
  ) then
    raise exception 'expired voice teaching extraction was not reclaimed';
  end if;

  if exists (
    select 1
    from expiring_claim original
    cross join expired_retry retry
    where original.claim_token = retry.claim_token
  ) then
    raise exception 'expired extraction retry did not rotate the claim token';
  end if;
end;
$$;

do $$
declare
  v_id uuid;
  v_token uuid;
  v_failed boolean;
begin
  select extraction_id, claim_token into v_id, v_token from first_claim;
  select public.fail_voice_teaching_extraction(
    v_id,
    '11111111-1111-4111-8111-111111111111',
    v_token,
    'test-failure'
  ) into v_failed;

  if v_failed is distinct from true then
    raise exception 'owned extraction attempt did not transition to failed';
  end if;
end;
$$;

create temporary table retry_claim as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'gpt-5-mini',
  1,
  150
);

do $$
begin
  if not exists (
    select 1 from retry_claim
    where claim_state = 'claimed'
      and attempt_count = 2
      and claim_token is not null
  ) then
    raise exception 'failed voice teaching extraction was not reclaimed';
  end if;

  if exists (
    select 1
    from first_claim original
    cross join retry_claim retry
    where original.claim_token = retry.claim_token
  ) then
    raise exception 'failed extraction retry did not rotate the claim token';
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
  select extraction_id, claim_token into v_id, v_old_token from first_claim;
  select claim_token into v_new_token from retry_claim;

  select public.complete_voice_teaching_extraction(
    v_id,
    '11111111-1111-4111-8111-111111111111',
    v_old_token,
    '[]'::jsonb
  ) into v_stale_completed;

  if v_stale_completed is distinct from false then
    raise exception 'stale extraction worker unexpectedly completed a newer attempt';
  end if;

  select public.complete_voice_teaching_extraction(
    v_id,
    '11111111-1111-4111-8111-111111111111',
    v_new_token,
    '[
      {
        "semantic_layer":"brain",
        "item_type":"principle",
        "priority":80,
        "title":"Fix the bottleneck first",
        "content":"Before scaling acquisition, fix the real bottleneck first.",
        "summary":"Fix the bottleneck before scaling.",
        "topics":["CAC","acquisition"],
        "source_excerpt":"Before scaling acquisition, fix the real bottleneck first."
      },
      {
        "semantic_layer":"brain",
        "item_type":"diagnostic_rule",
        "priority":100,
        "title":"CAC is diagnostic",
        "content":"Treat CAC as a diagnostic metric rather than the business goal.",
        "summary":null,
        "topics":["CAC"],
        "source_excerpt":"CAC is a diagnostic metric, not the business goal."
      }
    ]'::jsonb
  ) into v_completed;

  if v_completed is distinct from true then
    raise exception 'current voice teaching claim failed to complete';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from public.voice_teaching_extractions
    where voice_transcription_id = '20000000-0000-4000-8000-000000000001'
      and created_by = '11111111-1111-4111-8111-111111111111'
      and status = 'completed'
      and attempt_count = 2
      and claim_token is null
      and lease_expires_at is null
      and completed_at is not null
  ) then
    raise exception 'completed extraction state is incorrect';
  end if;

  if (
    select count(*)
    from public.voice_teaching_candidates
    where extraction_id = (select extraction_id from retry_claim)
  ) <> 2 then
    raise exception 'completed extraction did not persist exactly two candidates';
  end if;

  begin
    update public.voice_teaching_candidates
    set content = 'service-role mutation'
    where extraction_id = (select extraction_id from retry_claim)
      and ordinal = 1;
    raise exception 'service_role unexpectedly updated immutable candidate data';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  begin
    update public.voice_teaching_candidates
    set content = 'postgres mutation'
    where extraction_id = (select extraction_id from retry_claim)
      and ordinal = 1;
    raise exception 'postgres unexpectedly bypassed candidate immutability trigger';
  exception
    when others then
      if sqlerrm = 'postgres unexpectedly bypassed candidate immutability trigger' then
        raise;
      end if;
      if position('voice teaching candidate lineage is immutable' in sqlerrm) = 0 then
        raise exception 'candidate trigger returned unexpected error: %', sqlerrm;
      end if;
  end;
end;
$$;

set local role service_role;

create temporary table completed_claim as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'gpt-5-mini',
  1,
  150
);

do $$
begin
  if not exists (
    select 1 from completed_claim
    where claim_state = 'completed'
      and attempt_count = 2
  ) then
    raise exception 'completed extraction was not returned idempotently';
  end if;
end;
$$;

create temporary table zero_claim as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000003',
  '11111111-1111-4111-8111-111111111111',
  'gpt-5-mini',
  1,
  150
);

do $$
declare
  v_id uuid;
  v_token uuid;
  v_completed boolean;
begin
  select extraction_id, claim_token into v_id, v_token from zero_claim;
  select public.complete_voice_teaching_extraction(
    v_id,
    '11111111-1111-4111-8111-111111111111',
    v_token,
    '[]'::jsonb
  ) into v_completed;

  if v_completed is distinct from true then
    raise exception 'zero-candidate extraction did not complete';
  end if;

  if exists (
    select 1 from public.voice_teaching_candidates where extraction_id = v_id
  ) then
    raise exception 'zero-candidate extraction unexpectedly persisted candidates';
  end if;
end;
$$;

create temporary table wrong_owner_claim as
select * from public.claim_voice_teaching_extraction(
  '20000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'gpt-5-mini',
  1,
  150
);

do $$
begin
  if not exists (
    select 1 from wrong_owner_claim where claim_state = 'not_found'
  ) then
    raise exception 'wrong owner unexpectedly claimed a voice teaching extraction';
  end if;
end;
$$;

create temporary table candidate_ids as
select
  (select id from public.voice_teaching_candidates
    where extraction_id = (select extraction_id from retry_claim) and ordinal = 1) as first_id,
  (select id from public.voice_teaching_candidates
    where extraction_id = (select extraction_id from retry_claim) and ordinal = 2) as second_id;

create temporary table materialized_result as
select public.create_voice_teaching_drafts(
  (select extraction_id from retry_claim),
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_array(
    jsonb_build_object(
      'candidate_id', (select first_id from candidate_ids),
      'semantic_layer', 'brain',
      'item_type', 'diagnostic_rule',
      'priority', 60,
      'title', 'Edited bottleneck rule',
      'content', 'Diagnose the real constraint before increasing acquisition spend.',
      'summary', 'Diagnose before scaling.',
      'topics', jsonb_build_array('CAC', 'funnel'),
      'change_note', 'Reviewed after voice extraction'
    )
  )
) as result;

do $$
declare
  v_candidate_id uuid;
  v_brain_id uuid;
begin
  select first_id into v_candidate_id from candidate_ids;
  select brain_item_id into v_brain_id
  from public.voice_teaching_candidate_drafts
  where candidate_id = v_candidate_id;

  if v_brain_id is null then
    raise exception 'voice candidate did not create a Brain draft mapping';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_items
    where id = v_brain_id
      and status = 'draft'
      and semantic_layer = 'brain'
      and item_type = 'diagnostic_rule'
      and priority = 60
      and approved_version_number is null
      and published_version_number is null
  ) then
    raise exception 'voice materialization did not create an unpublished Brain draft';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_versions
    where item_id = v_brain_id
      and version_number = 1
      and title = 'Edited bottleneck rule'
      and content = 'Diagnose the real constraint before increasing acquisition spend.'
      and summary = 'Diagnose before scaling.'
      and topics = array['CAC','funnel']::text[]
      and change_note = 'Reviewed after voice extraction'
  ) then
    raise exception 'Brain version did not preserve reviewed edits';
  end if;

  if not exists (
    select 1
    from public.teaching_sources ts
    join public.teaching_items ti on ti.source_id = ts.id
    join public.teaching_versions tv on tv.teaching_item_id = ti.id
    where ti.brain_item_id = v_brain_id
      and tv.brain_item_id = v_brain_id
      and tv.version_number = 1
      and ts.source_type = 'voice'
      and ts.source_metadata ->> 'entrypoint' = 'voice_to_teaching'
      and ts.source_metadata ->> 'voice_recording_id' = '10000000-0000-4000-8000-000000000001'
      and ts.source_metadata ->> 'voice_transcription_id' = '20000000-0000-4000-8000-000000000001'
      and ts.source_metadata ->> 'voice_teaching_candidate_id' = v_candidate_id::text
      and ts.source_metadata ->> 'source_excerpt' = 'Before scaling acquisition, fix the real bottleneck first.'
      and tv.source_locator ->> 'kind' = 'voice_transcript_candidate'
      and tv.source_locator ->> 'voice_teaching_candidate_id' = v_candidate_id::text
  ) then
    raise exception 'voice lineage did not preserve exact source provenance';
  end if;
end;
$$;

do $$
declare
  v_candidate_id uuid;
  v_brain_count_before integer;
begin
  select first_id into v_candidate_id from candidate_ids;
  select count(*) into v_brain_count_before from public.eslam_brain_items;

  begin
    perform public.create_voice_teaching_drafts(
      (select extraction_id from retry_claim),
      '11111111-1111-4111-8111-111111111111',
      jsonb_build_array(
        jsonb_build_object(
          'candidate_id', v_candidate_id,
          'semantic_layer', 'brain',
          'item_type', 'principle',
          'priority', 100,
          'title', 'Duplicate',
          'content', 'Duplicate materialization must fail.',
          'summary', '',
          'topics', '[]'::jsonb,
          'change_note', ''
        )
      )
    );
    raise exception 'already materialized candidate unexpectedly created a second draft';
  exception
    when others then
      if sqlerrm = 'already materialized candidate unexpectedly created a second draft' then
        raise;
      end if;
      if position('already materialized' in sqlerrm) = 0 then
        raise exception 'duplicate materialization returned unexpected error: %', sqlerrm;
      end if;
  end;

  if (select count(*) from public.eslam_brain_items) <> v_brain_count_before then
    raise exception 'duplicate candidate attempt left partial Brain data';
  end if;
end;
$$;

do $$
declare
  v_first_id uuid;
  v_second_id uuid;
  v_second_mapping_before integer;
  v_brain_count_before integer;
begin
  select first_id, second_id into v_first_id, v_second_id from candidate_ids;
  select count(*) into v_second_mapping_before
  from public.voice_teaching_candidate_drafts
  where candidate_id = v_second_id;
  select count(*) into v_brain_count_before from public.eslam_brain_items;

  begin
    perform public.create_voice_teaching_drafts(
      (select extraction_id from retry_claim),
      '11111111-1111-4111-8111-111111111111',
      jsonb_build_array(
        jsonb_build_object(
          'candidate_id', v_second_id,
          'semantic_layer', 'brain',
          'item_type', 'principle',
          'priority', 90,
          'title', 'Second candidate',
          'content', 'This candidate must roll back because the next one is already materialized.',
          'summary', '',
          'topics', '[]'::jsonb,
          'change_note', ''
        ),
        jsonb_build_object(
          'candidate_id', v_first_id,
          'semantic_layer', 'brain',
          'item_type', 'principle',
          'priority', 90,
          'title', 'Already used',
          'content', 'Already used.',
          'summary', '',
          'topics', '[]'::jsonb,
          'change_note', ''
        )
      )
    );
    raise exception 'mixed materialization unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'mixed materialization unexpectedly succeeded' then
        raise;
      end if;
      if position('already materialized' in sqlerrm) = 0 then
        raise exception 'mixed materialization returned unexpected error: %', sqlerrm;
      end if;
  end;

  if (
    select count(*)
    from public.voice_teaching_candidate_drafts
    where candidate_id = v_second_id
  ) <> v_second_mapping_before then
    raise exception 'failed mixed materialization left a candidate mapping';
  end if;

  if (select count(*) from public.eslam_brain_items) <> v_brain_count_before then
    raise exception 'failed mixed materialization left partial Brain data';
  end if;
end;
$$;

reset role;
rollback;
