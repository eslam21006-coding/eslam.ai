begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('55555555-5555-4555-8555-555555555555','authenticated','authenticated','document-extraction-admin@example.com',now(),now());

set local role authenticated;
do $$
begin
  begin
    perform 1 from public.document_teaching_extractions;
    raise exception 'authenticated role unexpectedly read document teaching extractions';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Privileged fixture setup mirrors already-finalized Task 21 state. The deterministic source id is
-- test-only; production service_role receives the narrow column grants used by Task 21/22 RPCs.
insert into public.teaching_sources (id, source_type, title, source_uri, source_metadata, created_by)
values (
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'document',
  'Pricing Framework',
  'supabase-storage://eslam-teaching-documents/55555555-5555-4555-8555-555555555555/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.pdf',
  jsonb_build_object('entrypoint','document_teaching_upload'),
  '55555555-5555-4555-8555-555555555555'
);

insert into public.document_teaching_uploads (
  id, created_by, storage_path, status, source_title, original_filename, mime_type,
  declared_size_bytes, size_bytes, source_id, uploaded_at
) values (
  'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb.pdf',
  'uploaded','Pricing Framework','pricing.pdf','application/pdf',2048,2048,
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',now()
);

set local role service_role;

-- Prove the exact least-privilege contract used by the security-invoker Task 22 RPCs. These grants
-- come from the existing Brain, teaching-lineage, and document-upload migrations; Task 22 must not
-- broaden service_role merely to allow deterministic test fixture primary keys.
do $$
begin
  if not has_table_privilege(current_user, 'public.document_teaching_uploads', 'SELECT') then
    raise exception 'service_role lacks document teaching upload read privilege';
  end if;
  if not has_table_privilege(current_user, 'public.teaching_sources', 'SELECT') then
    raise exception 'service_role lacks teaching source read privilege';
  end if;
  if not has_column_privilege(current_user, 'public.teaching_sources', 'source_type', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_sources', 'title', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_sources', 'source_uri', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_sources', 'source_metadata', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_sources', 'created_by', 'INSERT') then
    raise exception 'service_role lacks teaching source insert-column privileges';
  end if;
  if not has_column_privilege(current_user, 'public.eslam_brain_items', 'semantic_layer', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_items', 'item_type', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_items', 'status', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_items', 'priority', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_items', 'created_by', 'INSERT') then
    raise exception 'service_role lacks Brain item insert-column privileges';
  end if;
  if not has_column_privilege(current_user, 'public.eslam_brain_versions', 'item_id', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_versions', 'version_number', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_versions', 'title', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_versions', 'content', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_versions', 'summary', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_versions', 'topics', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_versions', 'change_note', 'INSERT')
    or not has_column_privilege(current_user, 'public.eslam_brain_versions', 'created_by', 'INSERT') then
    raise exception 'service_role lacks Brain version insert-column privileges';
  end if;
  if not has_column_privilege(current_user, 'public.teaching_items', 'source_id', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_items', 'brain_item_id', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_items', 'created_by', 'INSERT') then
    raise exception 'service_role lacks teaching item insert-column privileges';
  end if;
  if not has_column_privilege(current_user, 'public.teaching_versions', 'teaching_item_id', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_versions', 'brain_item_id', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_versions', 'version_number', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_versions', 'source_locator', 'INSERT')
    or not has_column_privilege(current_user, 'public.teaching_versions', 'created_by', 'INSERT') then
    raise exception 'service_role lacks teaching version insert-column privileges';
  end if;
end;
$$;

do $$
declare
  v_claim record;
  v_busy record;
  v_retry record;
  v_expired_retry record;
  v_completed boolean;
  v_candidate_id uuid;
  v_result jsonb;
  v_brain_id uuid;
begin
  select * into v_claim from public.claim_document_teaching_extraction(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    '55555555-5555-4555-8555-555555555555',
    'gpt-5-mini',1,180
  );
  if v_claim.claim_state <> 'claimed' or v_claim.claim_token is null or v_claim.attempt_count <> 1 then
    raise exception 'initial document extraction claim failed';
  end if;

  select * into v_busy from public.claim_document_teaching_extraction(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    '55555555-5555-4555-8555-555555555555',
    'gpt-5-mini',1,180
  );
  if v_busy.claim_state <> 'busy' then raise exception 'active document extraction was not busy'; end if;

  if public.fail_document_teaching_extraction(
    v_claim.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    '99999999-9999-4999-8999-999999999999',
    'foreign-token'
  ) is true then
    raise exception 'foreign claim token unexpectedly failed the document extraction';
  end if;

  if public.fail_document_teaching_extraction(
    v_claim.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    v_claim.claim_token,
    'test-retry'
  ) is not true then
    raise exception 'document extraction failure transition failed';
  end if;

  select * into v_retry from public.claim_document_teaching_extraction(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    '55555555-5555-4555-8555-555555555555',
    'gpt-5-mini',1,180
  );
  if v_retry.claim_state <> 'claimed'
    or v_retry.claim_token is null
    or v_retry.claim_token = v_claim.claim_token
    or v_retry.attempt_count <> 2 then
    raise exception 'document extraction retry did not reclaim with a rotated token';
  end if;

  update public.document_teaching_extractions
  set lease_expires_at = timezone('utc', now()) - interval '1 second'
  where id = v_retry.extraction_id;

  select * into v_expired_retry from public.claim_document_teaching_extraction(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    '55555555-5555-4555-8555-555555555555',
    'gpt-5-mini',1,180
  );
  if v_expired_retry.claim_state <> 'claimed'
    or v_expired_retry.claim_token is null
    or v_expired_retry.claim_token = v_retry.claim_token
    or v_expired_retry.attempt_count <> 3 then
    raise exception 'expired document extraction lease was not reclaimed with a rotated token';
  end if;

  if public.fail_document_teaching_extraction(
    v_expired_retry.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    v_retry.claim_token,
    'stale-worker'
  ) is true then
    raise exception 'stale claim token unexpectedly failed a reclaimed document extraction';
  end if;

  v_completed := public.complete_document_teaching_extraction(
    v_expired_retry.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    v_expired_retry.claim_token,
    jsonb_build_array(jsonb_build_object(
      'semantic_layer','brain','item_type','principle','priority',100,
      'title','Price around contribution value',
      'content','Use contribution economics when deciding how much acquisition cost the offer can carry.',
      'summary','Pricing and CAC should be assessed against contribution economics.',
      'topics',jsonb_build_array('pricing','CAC'),
      'source_excerpt','Use contribution economics when deciding how much acquisition cost the offer can carry.',
      'source_locator','Page 4 · Pricing Economics'
    ))
  );
  if v_completed is not true then raise exception 'document extraction did not complete after lease reclaim'; end if;

  select id into v_candidate_id
  from public.document_teaching_candidates
  where extraction_id=v_expired_retry.extraction_id;
  if v_candidate_id is null then raise exception 'document candidate missing'; end if;

  if public.complete_document_teaching_extraction(
    v_expired_retry.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    v_retry.claim_token,
    '[]'::jsonb
  ) is true then
    raise exception 'stale completion unexpectedly succeeded';
  end if;

  v_result := public.create_document_teaching_drafts(
    v_expired_retry.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    jsonb_build_array(jsonb_build_object(
      'candidate_id',v_candidate_id,'semantic_layer','brain','item_type','principle','priority',90,
      'title','Contribution economics before CAC judgments',
      'content','Evaluate acquisition cost against contribution economics before deciding whether CAC is acceptable.',
      'summary','Judge CAC against contribution economics.',
      'topics',jsonb_build_array('pricing','CAC'),
      'change_note','Reviewed from document source'
    ))
  );

  v_brain_id := (v_result->0->>'brain_item_id')::uuid;
  if not exists (
    select 1 from public.eslam_brain_items
    where id=v_brain_id and status='draft' and approved_version_number is null and published_version_number is null
  ) then raise exception 'document candidate did not create a draft-only Brain item'; end if;

  if not exists (
    select 1 from public.teaching_items
    where brain_item_id=v_brain_id and source_id='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  ) then raise exception 'document Brain draft did not reuse the original document source'; end if;

  if not exists (
    select 1 from public.teaching_versions tv
    where tv.brain_item_id=v_brain_id
      and tv.source_locator->>'kind'='document_candidate'
      and tv.source_locator->>'document_upload_id'='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
      and tv.source_locator->>'source_locator'='Page 4 · Pricing Economics'
  ) then raise exception 'document provenance was not preserved on teaching version'; end if;

  begin
    perform public.create_document_teaching_drafts(
      v_expired_retry.extraction_id,
      '55555555-5555-4555-8555-555555555555',
      jsonb_build_array(jsonb_build_object(
        'candidate_id',v_candidate_id,'semantic_layer','brain','item_type','principle','priority',90,
        'title','Duplicate','content','Duplicate materialization must fail.','summary','',
        'topics','[]'::jsonb,'change_note',''
      ))
    );
    raise exception 'duplicate document candidate materialization unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'duplicate document candidate materialization unexpectedly succeeded' then raise; end if;
    if sqlerrm <> 'document teaching candidate already materialized' then
      raise exception 'duplicate materialization failed for the wrong reason: %', sqlerrm;
    end if;
  end;
end;
$$;

reset role;

do $$
begin
  if (select count(*) from public.teaching_sources where id='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa') <> 1 then
    raise exception 'document materialization duplicated its teaching source';
  end if;
end;
$$;

rollback;
