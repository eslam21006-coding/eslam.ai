-- Forward-only hardening for the already-applied Knowledge Library migrations.
-- p_created_by remains in the claim signature for API compatibility, but the library is global and Admin-managed.
create or replace function public.claim_knowledge_source_index(
  p_source_id uuid,
  p_created_by uuid,
  p_size_bytes bigint,
  p_lease_seconds integer default 180
)
returns table (
  source_id uuid,
  claim_state text,
  claim_token uuid,
  previous_openai_file_id text,
  previous_vector_store_id text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.knowledge_sources%rowtype;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := timezone('utc', now());
  v_previous_openai_file_id text;
  v_previous_vector_store_id text;
begin
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800
    or p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid knowledge source index claim';
  end if;

  select * into v_source
  from public.knowledge_sources
  where id = p_source_id
  for update;

  if not found then
    return query select null::uuid, 'not_found'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_source.declared_size_bytes <> p_size_bytes then
    raise exception 'knowledge source size mismatch';
  end if;

  if v_source.status = 'ready' then
    return query select v_source.id, 'ready'::text, null::uuid, v_source.openai_file_id, v_source.vector_store_id;
    return;
  end if;

  if v_source.status = 'deleting' then
    return query select v_source.id, 'deleting'::text, null::uuid, v_source.openai_file_id, v_source.vector_store_id;
    return;
  end if;

  if v_source.status = 'indexing' then
    if v_source.index_claim_token is null
      and v_source.openai_file_id is not null
      and v_source.vector_store_id is not null then
      return query select v_source.id, 'provider_indexing'::text, null::uuid, v_source.openai_file_id, v_source.vector_store_id;
      return;
    end if;

    if v_source.index_claim_token is not null
      and v_source.index_lease_expires_at > v_now then
      return query select v_source.id, 'busy'::text, null::uuid, null::text, null::text;
      return;
    end if;
  end if;

  if v_source.status not in ('pending', 'failed', 'indexing') then
    return query select v_source.id, 'not_claimable'::text, null::uuid, v_source.openai_file_id, v_source.vector_store_id;
    return;
  end if;

  v_previous_openai_file_id := v_source.openai_file_id;
  v_previous_vector_store_id := v_source.vector_store_id;

  update public.knowledge_sources
  set status = 'indexing',
      size_bytes = p_size_bytes,
      openai_file_id = null,
      vector_store_id = null,
      last_error_code = null,
      indexed_at = null,
      index_claim_token = v_token,
      index_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now
  where id = v_source.id;

  return query select v_source.id, 'claimed'::text, v_token, v_previous_openai_file_id, v_previous_vector_store_id;
end;
$$;

comment on function public.claim_knowledge_source_index(uuid, uuid, bigint, integer) is
  'Claims a global Knowledge Library source for indexing. p_created_by is retained only for call-signature compatibility; authorization happens in the Admin server action.';

revoke execute on function public.claim_knowledge_source_index(uuid, uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.claim_knowledge_source_index(uuid, uuid, bigint, integer)
  to service_role;

create or replace function public.claim_knowledge_source_delete(
  p_source_id uuid
)
returns table (
  source_id uuid,
  claim_state text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.knowledge_sources%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  select * into v_source
  from public.knowledge_sources
  where id = p_source_id
  for update;

  if not found then
    return query select null::uuid, 'not_found'::text;
    return;
  end if;

  if v_source.status = 'deleting' then
    return query select v_source.id, 'deleting'::text;
    return;
  end if;

  if v_source.status = 'indexing'
    and v_source.index_claim_token is not null
    and v_source.index_lease_expires_at > v_now then
    return query select v_source.id, 'busy'::text;
    return;
  end if;

  update public.knowledge_sources
  set status = 'deleting',
      index_claim_token = null,
      index_lease_expires_at = null,
      updated_at = v_now
  where id = v_source.id;

  return query select v_source.id, 'claimed'::text;
end;
$$;

revoke execute on function public.claim_knowledge_source_delete(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_knowledge_source_delete(uuid)
  to service_role;

create or replace function public.get_knowledge_retrieval_state()
returns table (
  vector_store_id text
)
language sql
security invoker
stable
set search_path = ''
as $$
  select case
    when config.vector_store_id is not null
      and exists (
        select 1
        from public.knowledge_sources as ready_source
        where ready_source.status = 'ready'
          and ready_source.vector_store_id = config.vector_store_id
      )
      and not exists (
        select 1
        from public.knowledge_sources as indexing_source
        where indexing_source.status = 'indexing'
      )
      and not exists (
        select 1
        from public.knowledge_sources as cleanup_source
        where cleanup_source.status in ('failed', 'deleting')
          and cleanup_source.openai_file_id is not null
          and cleanup_source.vector_store_id = config.vector_store_id
      )
    then config.vector_store_id
    else null
  end as vector_store_id
  from public.knowledge_library_config as config
  where config.library_key = 'global'
$$;

revoke execute on function public.get_knowledge_retrieval_state()
  from public, anon, authenticated;
grant execute on function public.get_knowledge_retrieval_state()
  to service_role;
