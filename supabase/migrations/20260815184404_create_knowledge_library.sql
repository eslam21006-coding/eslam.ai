create table public.knowledge_library_config (
  library_key text primary key default 'global',
  vector_store_id text unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint knowledge_library_config_singleton_check check (library_key = 'global'),
  constraint knowledge_library_config_vector_store_check check (
    vector_store_id is null or char_length(btrim(vector_store_id)) between 1 and 200
  )
);

insert into public.knowledge_library_config (library_key)
values ('global')
on conflict (library_key) do nothing;

alter table public.knowledge_library_config enable row level security;
revoke all on table public.knowledge_library_config from public, anon, authenticated, service_role;
grant select, insert, update on table public.knowledge_library_config to service_role;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  storage_bucket text not null default 'eslam-knowledge-documents',
  storage_path text not null,
  status text not null default 'pending',
  title text not null,
  original_filename text not null,
  mime_type text not null,
  declared_size_bytes bigint not null,
  size_bytes bigint,
  openai_file_id text unique,
  vector_store_id text,
  last_error_code text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  indexed_at timestamptz,
  constraint knowledge_sources_storage_location_unique unique (storage_bucket, storage_path),
  constraint knowledge_sources_storage_bucket_check check (storage_bucket = 'eslam-knowledge-documents'),
  constraint knowledge_sources_storage_owner_check check (storage_path like created_by::text || '/%'),
  constraint knowledge_sources_status_check check (status in ('pending', 'indexing', 'ready', 'failed', 'deleting')),
  constraint knowledge_sources_title_check check (char_length(btrim(title)) between 1 and 200),
  constraint knowledge_sources_original_filename_check check (char_length(btrim(original_filename)) between 1 and 255),
  constraint knowledge_sources_mime_type_check check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    )
  ),
  constraint knowledge_sources_declared_size_check check (
    declared_size_bytes > 0 and declared_size_bytes <= 52428800
  ),
  constraint knowledge_sources_size_check check (
    size_bytes is null or (size_bytes > 0 and size_bytes = declared_size_bytes)
  ),
  constraint knowledge_sources_openai_file_check check (
    openai_file_id is null or char_length(btrim(openai_file_id)) between 1 and 200
  ),
  constraint knowledge_sources_vector_store_check check (
    vector_store_id is null or char_length(btrim(vector_store_id)) between 1 and 200
  ),
  constraint knowledge_sources_error_code_check check (
    last_error_code is null or char_length(btrim(last_error_code)) between 1 and 100
  ),
  constraint knowledge_sources_state_check check (
    status = 'deleting'
    or (
      status = 'pending'
      and size_bytes is null
      and openai_file_id is null
      and vector_store_id is null
      and indexed_at is null
      and last_error_code is null
    )
    or (
      status = 'indexing'
      and size_bytes is not null
      and openai_file_id is not null
      and vector_store_id is not null
      and indexed_at is null
      and last_error_code is null
    )
    or (
      status = 'ready'
      and size_bytes is not null
      and openai_file_id is not null
      and vector_store_id is not null
      and indexed_at is not null
      and last_error_code is null
    )
    or (
      status = 'failed'
      and size_bytes is not null
      and indexed_at is null
      and last_error_code is not null
    )
  )
);

create index knowledge_sources_owner_status_created_idx
  on public.knowledge_sources (created_by, status, created_at desc, id desc);
create index knowledge_sources_ready_vector_store_idx
  on public.knowledge_sources (vector_store_id, created_at desc, id desc)
  where status = 'ready';

alter table public.knowledge_sources enable row level security;
revoke all on table public.knowledge_sources from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.knowledge_sources to service_role;

comment on table public.knowledge_sources is
  'Admin-only durable Knowledge Library sources. OpenAI files/vector-store entries are derived search indexes, not the source of truth and never create Brain teachings automatically.';
comment on column public.knowledge_sources.last_error_code is
  'Internal retry classification only; raw provider errors are not rendered in product UI.';

do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $bucket$
      insert into storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
      ) values (
        'eslam-knowledge-documents',
        'eslam-knowledge-documents',
        false,
        52428800,
        array[
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/markdown'
        ]::text[]
      )
      on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types
    $bucket$;
  end if;
end;
$$;
