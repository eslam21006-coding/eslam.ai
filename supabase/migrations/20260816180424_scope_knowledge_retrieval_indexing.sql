-- Keep global Knowledge retrieval available while unrelated or not-yet-attached sources index.
-- Applied Knowledge migrations are immutable; this forward migration narrows only the retrieval gate.
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
          and indexing_source.vector_store_id = config.vector_store_id
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
