begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'knowledge-owner@example.com',
    now(),
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'knowledge-admin@example.com',
    now(),
    now()
  );

set local role authenticated;
do $$
begin
  begin
    perform 1 from public.knowledge_sources;
    raise exception 'authenticated role unexpectedly read Knowledge Library sources';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.knowledge_library_config;
    raise exception 'authenticated role unexpectedly read Knowledge Library config';
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
    insert into public.knowledge_sources (
      created_by,
      storage_path,
      title,
      original_filename,
      mime_type,
      declared_size_bytes
    ) values (
      '33333333-3333-4333-8333-333333333333',
      '33333333-3333-4333-8333-333333333333/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
      'Anon source',
      'anon.pdf',
      'application/pdf',
      100
    );
    raise exception 'anon role unexpectedly inserted Knowledge source';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.claim_knowledge_source_index(uuid,uuid,bigint,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Knowledge index claim EXECUTE';
  end if;

  if has_function_privilege(
    'anon',
    'public.claim_knowledge_source_index(uuid,uuid,bigint,integer)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly has Knowledge index claim EXECUTE';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.claim_knowledge_source_delete(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Knowledge delete claim EXECUTE';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.get_knowledge_retrieval_state()',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has Knowledge retrieval-state EXECUTE';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_knowledge_source_index(uuid,uuid,bigint,integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing Knowledge index claim EXECUTE';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_knowledge_source_delete(uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing Knowledge delete claim EXECUTE';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.get_knowledge_retrieval_state()',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing Knowledge retrieval-state EXECUTE';
  end if;
end;
$$;

set local role service_role;

do $$
begin
  if not exists (
    select 1 from public.knowledge_library_config
    where library_key = 'global' and vector_store_id is null
  ) then
    raise exception 'global Knowledge Library config row missing';
  end if;
end;
$$;

insert into public.knowledge_sources (
  id,
  created_by,
  storage_path,
  title,
  original_filename,
  mime_type,
  declared_size_bytes
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333333/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
  'Reference Manual',
  'reference.pdf',
  'application/pdf',
  4096
);

do $$
begin
  if not exists (
    select 1 from public.knowledge_sources
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'pending'
      and size_bytes is null
      and openai_file_id is null
      and vector_store_id is null
      and indexed_at is null
      and index_claim_token is null
      and index_lease_expires_at is null
  ) then
    raise exception 'valid Knowledge source did not begin pending';
  end if;

  begin
    insert into public.knowledge_sources (
      created_by,
      storage_path,
      title,
      original_filename,
      mime_type,
      declared_size_bytes
    ) values (
      '33333333-3333-4333-8333-333333333333',
      '99999999-9999-4999-8999-999999999999/wrong-owner.pdf',
      'Wrong owner path',
      'wrong-owner.pdf',
      'application/pdf',
      100
    );
    raise exception 'cross-owner Knowledge storage path unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    update public.knowledge_sources
    set status = 'ready',
        size_bytes = 4096,
        openai_file_id = null,
        vector_store_id = 'vs_test',
        indexed_at = now()
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'ready Knowledge source without OpenAI file unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$$;

do $$
declare
  v_first record;
  v_second record;
  v_delete_busy record;
  v_reclaimed record;
begin
  -- The acting Admin differs from created_by: Knowledge management is intentionally global.
  select * into v_first
  from public.claim_knowledge_source_index(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '44444444-4444-4444-8444-444444444444',
    4096,
    180
  );

  if v_first.claim_state <> 'claimed' or v_first.claim_token is null then
    raise exception 'global Admin could not claim another Admin-authored Knowledge source';
  end if;

  select * into v_second
  from public.claim_knowledge_source_index(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    4096,
    180
  );

  if v_second.claim_state <> 'busy' or v_second.claim_token is not null then
    raise exception 'concurrent Knowledge index claim was not fenced as busy';
  end if;

  select * into v_delete_busy
  from public.claim_knowledge_source_delete('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  if v_delete_busy.claim_state <> 'busy' then
    raise exception 'active Knowledge index lease was not fenced from deletion';
  end if;

  update public.knowledge_sources
  set index_lease_expires_at = timezone('utc', now()) - interval '1 second'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select * into v_reclaimed
  from public.claim_knowledge_source_index(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333',
    4096,
    180
  );

  if v_reclaimed.claim_state <> 'claimed'
    or v_reclaimed.claim_token is null
    or v_reclaimed.claim_token = v_first.claim_token then
    raise exception 'expired Knowledge index claim was not safely reclaimed';
  end if;
end;
$$;

update public.knowledge_library_config
set vector_store_id = 'vs_test', updated_at = now()
where library_key = 'global';

update public.knowledge_sources
set status = 'indexing',
    size_bytes = 4096,
    openai_file_id = 'file_test',
    vector_store_id = 'vs_test',
    index_claim_token = null,
    index_lease_expires_at = null,
    updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  v_provider record;
  v_retrieval text;
begin
  select vector_store_id into v_retrieval
  from public.get_knowledge_retrieval_state();

  if v_retrieval is not null then
    raise exception 'Knowledge retrieval was enabled during provider indexing';
  end if;

  select * into v_provider
  from public.claim_knowledge_source_index(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '44444444-4444-4444-8444-444444444444',
    4096,
    180
  );

  if v_provider.claim_state <> 'provider_indexing' then
    raise exception 'provider indexing state was unexpectedly reclaimable';
  end if;
end;
$$;

update public.knowledge_sources
set status = 'ready',
    indexed_at = now(),
    updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  v_retrieval text;
begin
  select vector_store_id into v_retrieval
  from public.get_knowledge_retrieval_state();

  if v_retrieval <> 'vs_test' then
    raise exception 'ready Knowledge source did not enable the configured vector store';
  end if;

  if not exists (
    select 1 from public.knowledge_sources
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'ready'
      and size_bytes = 4096
      and openai_file_id = 'file_test'
      and vector_store_id = 'vs_test'
      and indexed_at is not null
      and index_claim_token is null
      and index_lease_expires_at is null
  ) then
    raise exception 'Knowledge source did not reach valid ready state';
  end if;

  if exists (select 1 from public.teaching_sources) then
    raise exception 'Knowledge Library unexpectedly created a teaching source';
  end if;

  if exists (select 1 from public.eslam_brain_items) then
    raise exception 'Knowledge Library unexpectedly created Brain content';
  end if;
end;
$$;

update public.knowledge_sources
set status = 'failed',
    indexed_at = null,
    last_error_code = 'cleanup-required',
    updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  v_retrieval text;
begin
  select vector_store_id into v_retrieval
  from public.get_knowledge_retrieval_state();

  if v_retrieval is not null then
    raise exception 'Knowledge retrieval was enabled while attached provider cleanup was unresolved';
  end if;
end;
$$;

update public.knowledge_sources
set status = 'ready',
    indexed_at = now(),
    last_error_code = null,
    updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  v_delete record;
begin
  select * into v_delete
  from public.claim_knowledge_source_delete('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  if v_delete.claim_state <> 'claimed' then
    raise exception 'ready Knowledge source could not be claimed for deletion';
  end if;

  if not exists (
    select 1 from public.knowledge_sources
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'deleting'
      and index_claim_token is null
      and index_lease_expires_at is null
      and openai_file_id = 'file_test'
  ) then
    raise exception 'Knowledge delete claim did not preserve provider cleanup pointer';
  end if;
end;
$$;

delete from public.knowledge_sources
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

reset role;
rollback;
