alter table public.knowledge_sources
  drop constraint knowledge_sources_state_check;

alter table public.knowledge_sources
  add constraint knowledge_sources_state_check check (
    status = 'deleting'
    or (
      status = 'pending'
      and size_bytes is null
      and openai_file_id is null
      and vector_store_id is null
      and indexed_at is null
      and last_error_code is null
      and index_claim_token is null
      and index_lease_expires_at is null
    )
    or (
      status = 'indexing'
      and size_bytes is not null
      and indexed_at is null
      and last_error_code is null
      and (
        (
          index_claim_token is not null
          and index_lease_expires_at is not null
          and (
            (openai_file_id is null and vector_store_id is null)
            or (openai_file_id is not null and vector_store_id is not null)
          )
        )
        or (
          index_claim_token is null
          and index_lease_expires_at is null
          and openai_file_id is not null
          and vector_store_id is not null
        )
      )
    )
    or (
      status = 'ready'
      and size_bytes is not null
      and openai_file_id is not null
      and vector_store_id is not null
      and indexed_at is not null
      and last_error_code is null
      and index_claim_token is null
      and index_lease_expires_at is null
    )
    or (
      status = 'failed'
      and size_bytes is not null
      and indexed_at is null
      and last_error_code is not null
      and index_claim_token is null
      and index_lease_expires_at is null
      and (
        (openai_file_id is null and vector_store_id is null)
        or (openai_file_id is not null and vector_store_id is not null)
      )
    )
  );
