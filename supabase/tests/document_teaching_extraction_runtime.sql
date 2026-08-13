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

set local role service_role;

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

do $$
declare
  v_claim record;
  v_busy record;
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

  v_completed := public.complete_document_teaching_extraction(
    v_claim.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    v_claim.claim_token,
    jsonb_build_array(jsonb_build_object(
      'semantic_layer','brain',
      'item_type','principle',
      'priority',100,
      'title','Price around contribution value',
      'content','Use contribution economics when deciding how much acquisition cost the offer can carry.',
      'summary','Pricing and CAC should be assessed against contribution economics.',
      'topics',jsonb_build_array('pricing','CAC'),
      'source_excerpt','Use contribution economics when deciding how much acquisition cost the offer can carry.',
      'source_locator','Page 4 · Pricing Economics'
    ))
  );
  if v_completed is not true then raise exception 'document extraction did not complete'; end if;

  select id into v_candidate_id from public.document_teaching_candidates where extraction_id=v_claim.extraction_id;
  if v_candidate_id is null then raise exception 'document candidate missing'; end if;

  if public.complete_document_teaching_extraction(
    v_claim.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    v_claim.claim_token,
    '[]'::jsonb
  ) is true then
    raise exception 'stale completion unexpectedly succeeded';
  end if;

  v_result := public.create_document_teaching_drafts(
    v_claim.extraction_id,
    '55555555-5555-4555-8555-555555555555',
    jsonb_build_array(jsonb_build_object(
      'candidate_id',v_candidate_id,
      'semantic_layer','brain',
      'item_type','principle',
      'priority',90,
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

  if (select count(*) from public.teaching_sources where id='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa') <> 1 then
    raise exception 'document materialization duplicated its teaching source';
  end if;

  if not exists (
    select 1
    from public.teaching_versions tv
    where tv.brain_item_id=v_brain_id
      and tv.source_locator->>'kind'='document_candidate'
      and tv.source_locator->>'document_upload_id'='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
      and tv.source_locator->>'source_locator'='Page 4 · Pricing Economics'
  ) then raise exception 'document provenance was not preserved on teaching version'; end if;

  begin
    perform public.create_document_teaching_drafts(
      v_claim.extraction_id,
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
  end;
end;
$$;

reset role;
rollback;
