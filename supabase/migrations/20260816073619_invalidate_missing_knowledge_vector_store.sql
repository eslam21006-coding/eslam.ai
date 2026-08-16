-- Fail closed and make durable Knowledge sources retryable when the derived provider store disappears.
create or replace function public.invalidate_missing_knowledge_vector_store(
  p_vector_store_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current text;
  v_now timestamptz := timezone('utc', now());
begin
  if p_vector_store_id is null or btrim(p_vector_store_id) = '' then
    raise exception 'invalid knowledge vector store id';
  end if;

  select vector_store_id into v_current
  from public.knowledge_library_config
  where library_key = 'global'
  for update;

  if v_current is distinct from p_vector_store_id then
    return false;
  end if;

  update public.knowledge_library_config
  set vector_store_id = null,
      updated_at = v_now
  where library_key = 'global'
    and vector_store_id = p_vector_store_id;

  update public.knowledge_sources
  set status = 'failed',
      last_error_code = 'vector-store-not-found',
      indexed_at = null,
      index_claim_token = null,
      index_lease_expires_at = null,
      updated_at = v_now
  where status = 'ready'
    and vector_store_id = p_vector_store_id;

  return true;
end;
$$;

comment on function public.invalidate_missing_knowledge_vector_store(text) is
  'Atomically clears a missing global provider vector store and marks its ready Knowledge sources retryable while preserving durable source and provider-file cleanup pointers.';

revoke execute on function public.invalidate_missing_knowledge_vector_store(text)
  from public, anon, authenticated;
grant execute on function public.invalidate_missing_knowledge_vector_store(text)
  to service_role;
