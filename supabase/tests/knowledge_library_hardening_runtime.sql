begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.claim_knowledge_source_delete(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly has Knowledge delete claim EXECUTE';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_knowledge_retrieval_state()',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly has Knowledge retrieval-state EXECUTE';
  end if;
end;
$$;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values (
  '55555555-5555-4555-8555-555555555555',
  'authenticated',
  'authenticated',
  'knowledge-hardening@example.com',
  now(),
  now()
);

set local role service_role;

insert into public.knowledge_sources (
  id,
  created_by,
  storage_path,
  title,
  original_filename,
  mime_type,
  declared_size_bytes
) values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '55555555-5555-4555-8555-555555555555',
    '55555555-5555-4555-8555-555555555555/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.txt',
    'Ready current-store source',
    'ready.txt',
    'text/plain',
    100
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '55555555-5555-4555-8555-555555555555',
    '55555555-5555-4555-8555-555555555555/cccccccc-cccc-4ccc-8ccc-cccccccccccc.txt',
    'Other-store lifecycle source',
    'other.txt',
    'text/plain',
    100
  );

update public.knowledge_library_config
set vector_store_id = 'vs_current', updated_at = now()
where library_key = 'global';

update public.knowledge_sources
set status = 'ready',
    size_bytes = 100,
    openai_file_id = 'file_ready_current',
    vector_store_id = 'vs_current',
    indexed_at = now(),
    updated_at = now()
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

update public.knowledge_sources
set status = 'indexing',
    size_bytes = 100,
    openai_file_id = 'file_indexing_other',
    vector_store_id = 'vs_other',
    index_claim_token = null,
    index_lease_expires_at = null,
    updated_at = now()
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
declare
  v_retrieval text;
begin
  select vector_store_id into v_retrieval
  from public.get_knowledge_retrieval_state();

  if v_retrieval <> 'vs_current' then
    raise exception 'indexing on an unrelated vector store unexpectedly disabled Knowledge retrieval';
  end if;
end;
$$;

update public.knowledge_sources
set status = 'failed',
    size_bytes = 100,
    openai_file_id = 'file_cleanup_other',
    vector_store_id = 'vs_other',
    indexed_at = null,
    last_error_code = 'cleanup-required',
    index_claim_token = null,
    index_lease_expires_at = null,
    updated_at = now()
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
declare
  v_retrieval text;
begin
  select vector_store_id into v_retrieval
  from public.get_knowledge_retrieval_state();

  if v_retrieval <> 'vs_current' then
    raise exception 'cleanup on an unrelated vector store unexpectedly disabled Knowledge retrieval';
  end if;
end;
$$;

update public.knowledge_sources
set status = 'indexing',
    size_bytes = 100,
    openai_file_id = 'file_indexing_current',
    vector_store_id = 'vs_current',
    indexed_at = null,
    last_error_code = null,
    index_claim_token = null,
    index_lease_expires_at = null,
    updated_at = now()
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
declare
  v_retrieval text;
begin
  select vector_store_id into v_retrieval
  from public.get_knowledge_retrieval_state();

  if v_retrieval is not null then
    raise exception 'indexing on the configured vector store unexpectedly left Knowledge retrieval enabled';
  end if;
end;
$$;

-- Expired claims retain their provider cleanup pointers when reclaimed. The configured-store
-- pointer therefore continues to fail retrieval closed until the replacement attempt reconciles it.
update public.knowledge_sources
set status = 'indexing',
    size_bytes = 100,
    openai_file_id = 'file_reclaimed_current',
    vector_store_id = 'vs_current',
    indexed_at = null,
    last_error_code = null,
    index_claim_token = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    index_lease_expires_at = timezone('utc', now()) - interval '1 second',
    updated_at = now()
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
declare
  v_claim record;
  v_retrieval text;
begin
  select * into v_claim
  from public.claim_knowledge_source_index(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '55555555-5555-4555-8555-555555555555',
    100,
    180
  );

  if v_claim.claim_state <> 'claimed'
    or v_claim.claim_token is null
    or v_claim.claim_token = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid
    or v_claim.previous_openai_file_id <> 'file_reclaimed_current'
    or v_claim.previous_vector_store_id <> 'vs_current' then
    raise exception 'expired Knowledge claim was not reclaimed with retained provider cleanup pointers';
  end if;

  select vector_store_id into v_retrieval
  from public.get_knowledge_retrieval_state();

  if v_retrieval is not null then
    raise exception 'reclaimed configured-store indexing unexpectedly left Knowledge retrieval enabled';
  end if;
end;
$$;

reset role;
rollback;
