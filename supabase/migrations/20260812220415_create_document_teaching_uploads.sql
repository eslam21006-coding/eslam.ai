create table public.document_teaching_uploads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  storage_bucket text not null default 'eslam-teaching-documents',
  storage_path text not null,
  status text not null default 'pending',
  source_title text not null,
  original_filename text not null,
  mime_type text not null,
  declared_size_bytes bigint not null,
  size_bytes bigint,
  source_id uuid unique references public.teaching_sources(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  uploaded_at timestamptz,
  constraint document_teaching_uploads_storage_location_unique unique (storage_bucket, storage_path),
  constraint document_teaching_uploads_storage_bucket_check check (storage_bucket = 'eslam-teaching-documents'),
  constraint document_teaching_uploads_storage_owner_check check (storage_path like created_by::text || '/%'),
  constraint document_teaching_uploads_status_check check (status in ('pending', 'cancelling', 'uploaded')),
  constraint document_teaching_uploads_source_title_check check (char_length(btrim(source_title)) between 1 and 200),
  constraint document_teaching_uploads_original_filename_check check (char_length(btrim(original_filename)) between 1 and 255),
  constraint document_teaching_uploads_mime_type_check check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    )
  ),
  constraint document_teaching_uploads_declared_size_check check (
    declared_size_bytes > 0 and declared_size_bytes <= 52428800
  ),
  constraint document_teaching_uploads_size_check check (
    size_bytes is null or size_bytes = declared_size_bytes
  ),
  constraint document_teaching_uploads_state_check check (
    (
      status in ('pending', 'cancelling')
      and size_bytes is null
      and source_id is null
      and uploaded_at is null
    )
    or (
      status = 'uploaded'
      and size_bytes is not null
      and source_id is not null
      and uploaded_at is not null
    )
  )
);

create index document_teaching_uploads_owner_status_created_idx
  on public.document_teaching_uploads (created_by, status, created_at desc, id desc);

alter table public.document_teaching_uploads enable row level security;

revoke all on table public.document_teaching_uploads from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.document_teaching_uploads to service_role;

create policy "document teaching uploads deny anon select"
  on public.document_teaching_uploads for select to anon using (false);
create policy "document teaching uploads deny authenticated select"
  on public.document_teaching_uploads for select to authenticated using (false);

comment on table public.document_teaching_uploads is
  'Admin-only document upload lifecycle. Uploaded documents become immutable document teaching sources but never create Brain content directly.';
comment on column public.document_teaching_uploads.storage_path is
  'Server-generated private Storage path scoped by admin user id and document upload id.';
comment on column public.document_teaching_uploads.source_id is
  'Exact immutable teaching_sources row created atomically only after server-side Storage verification.';

create or replace function public.prevent_uploaded_document_teaching_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'uploaded' and new is distinct from old then
    raise exception 'uploaded document teaching sources are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger prevent_uploaded_document_teaching_update
before update on public.document_teaching_uploads
for each row execute function public.prevent_uploaded_document_teaching_mutation();

create or replace function public.prevent_uploaded_document_teaching_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'uploaded' then
    raise exception 'uploaded document teaching sources are immutable' using errcode = '55000';
  end if;
  return old;
end;
$$;

create trigger prevent_uploaded_document_teaching_delete
before delete on public.document_teaching_uploads
for each row execute function public.prevent_uploaded_document_teaching_delete();

create or replace function public.finalize_document_teaching_upload(
  p_document_id uuid,
  p_created_by uuid,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.document_teaching_uploads%rowtype;
  v_source_id uuid;
begin
  if p_document_id is null or p_created_by is null then
    raise exception 'document and creator are required' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 52428800 then
    raise exception 'invalid document teaching size' using errcode = '22023';
  end if;

  select * into v_row
  from public.document_teaching_uploads
  where id = p_document_id
    and created_by = p_created_by
  for update;

  if not found then
    raise exception 'document teaching upload not found' using errcode = 'P0002';
  end if;

  if v_row.status = 'uploaded' then
    return v_row.source_id;
  end if;
  if v_row.status <> 'pending' then
    raise exception 'document teaching upload is not finalizable' using errcode = '55000';
  end if;
  if p_size_bytes <> v_row.declared_size_bytes then
    raise exception 'document teaching size mismatch' using errcode = '22023';
  end if;

  insert into public.teaching_sources (
    source_type,
    title,
    source_uri,
    source_metadata,
    created_by
  ) values (
    'document',
    v_row.source_title,
    'supabase-storage://' || v_row.storage_bucket || '/' || v_row.storage_path,
    jsonb_build_object(
      'entrypoint', 'document_teaching_upload',
      'capture_mode', 'document_upload',
      'document_upload_id', v_row.id,
      'storage_bucket', v_row.storage_bucket,
      'storage_path', v_row.storage_path,
      'original_filename', v_row.original_filename,
      'mime_type', v_row.mime_type,
      'size_bytes', p_size_bytes
    ),
    p_created_by
  ) returning id into v_source_id;

  update public.document_teaching_uploads
  set status = 'uploaded',
      size_bytes = p_size_bytes,
      source_id = v_source_id,
      uploaded_at = timezone('utc', now())
  where id = v_row.id;

  return v_source_id;
end;
$$;

revoke all on function public.finalize_document_teaching_upload(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.finalize_document_teaching_upload(uuid, uuid, bigint)
  to service_role;

revoke all on function public.prevent_uploaded_document_teaching_mutation()
  from public, anon, authenticated;
grant execute on function public.prevent_uploaded_document_teaching_mutation()
  to service_role;

revoke all on function public.prevent_uploaded_document_teaching_delete()
  from public, anon, authenticated;
grant execute on function public.prevent_uploaded_document_teaching_delete()
  to service_role;

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
        'eslam-teaching-documents',
        'eslam-teaching-documents',
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
