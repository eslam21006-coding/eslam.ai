begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'document-admin@example.com',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'other-admin@example.com',
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform 1 from public.document_teaching_uploads;
    raise exception 'authenticated role unexpectedly read document teaching uploads';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.finalize_document_teaching_upload(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      100
    );
    raise exception 'authenticated role unexpectedly executed document finalize RPC';
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
    insert into public.document_teaching_uploads (
      created_by,
      storage_path,
      source_title,
      original_filename,
      mime_type,
      declared_size_bytes
    ) values (
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
      'Anon document',
      'anon.pdf',
      'application/pdf',
      100
    );
    raise exception 'anon role unexpectedly inserted document teaching upload';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role service_role;

insert into public.document_teaching_uploads (
  id,
  created_by,
  storage_path,
  source_title,
  original_filename,
  mime_type,
  declared_size_bytes
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
  'High-Ticket Offer Framework',
  'offer-framework.pdf',
  'application/pdf',
  4096
);

do $$
begin
  begin
    insert into public.document_teaching_uploads (
      created_by,
      storage_path,
      source_title,
      original_filename,
      mime_type,
      declared_size_bytes
    ) values (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222/wrong-owner.pdf',
      'Wrong owner path',
      'wrong-owner.pdf',
      'application/pdf',
      100
    );
    raise exception 'cross-owner storage path unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.finalize_document_teaching_upload(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      4096
    );
    raise exception 'non-owner finalize unexpectedly succeeded';
  exception
    when no_data_found then null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.finalize_document_teaching_upload(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      4095
    );
    raise exception 'size mismatch unexpectedly finalized document source';
  exception
    when invalid_parameter_value then null;
  end;

  if exists (
    select 1
    from public.document_teaching_uploads
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and (status <> 'pending' or source_id is not null or size_bytes is not null)
  ) then
    raise exception 'failed finalize mutated pending document upload';
  end if;

  if exists (
    select 1 from public.teaching_sources
    where created_by = '11111111-1111-4111-8111-111111111111'
      and source_type = 'document'
  ) then
    raise exception 'failed finalize created document teaching source';
  end if;
end;
$$;

create temporary table finalized_document_source (source_id uuid not null);
insert into finalized_document_source (source_id)
select public.finalize_document_teaching_upload(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  4096
);

do $$
declare
  v_source_id uuid := (select source_id from finalized_document_source limit 1);
begin
  if v_source_id is null then
    raise exception 'valid finalize returned no document teaching source';
  end if;

  if not exists (
    select 1
    from public.document_teaching_uploads
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and created_by = '11111111-1111-4111-8111-111111111111'
      and status = 'uploaded'
      and size_bytes = 4096
      and source_id = v_source_id
      and uploaded_at is not null
  ) then
    raise exception 'document upload was not finalized to uploaded state';
  end if;

  if not exists (
    select 1
    from public.teaching_sources
    where id = v_source_id
      and source_type = 'document'
      and title = 'High-Ticket Offer Framework'
      and source_uri = 'supabase-storage://eslam-teaching-documents/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf'
      and created_by = '11111111-1111-4111-8111-111111111111'
      and source_metadata ->> 'entrypoint' = 'document_teaching_upload'
      and source_metadata ->> 'capture_mode' = 'document_upload'
      and source_metadata ->> 'document_upload_id' = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and source_metadata ->> 'storage_bucket' = 'eslam-teaching-documents'
      and source_metadata ->> 'storage_path' = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf'
      and source_metadata ->> 'original_filename' = 'offer-framework.pdf'
      and source_metadata ->> 'mime_type' = 'application/pdf'
      and (source_metadata ->> 'size_bytes')::bigint = 4096
  ) then
    raise exception 'document teaching source provenance is incomplete or incorrect';
  end if;

  if exists (
    select 1 from public.teaching_items where source_id = v_source_id
  ) then
    raise exception 'Task 21 unexpectedly created a teaching item / Brain linkage';
  end if;

  if exists (
    select 1 from public.eslam_brain_items
    where created_by = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'Task 21 unexpectedly created Brain content';
  end if;

  if exists (
    select 1 from public.teaching_versions
    where created_by = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'Task 21 unexpectedly created teaching versions';
  end if;
end;
$$;

do $$
declare
  v_first uuid := (select source_id from finalized_document_source limit 1);
  v_second uuid;
begin
  v_second := public.finalize_document_teaching_upload(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    4096
  );

  if v_second is distinct from v_first then
    raise exception 'idempotent finalize returned a different document source';
  end if;

  if (
    select count(*)
    from public.teaching_sources
    where created_by = '11111111-1111-4111-8111-111111111111'
      and source_type = 'document'
  ) <> 1 then
    raise exception 'idempotent finalize duplicated document teaching source';
  end if;
end;
$$;

do $$
begin
  begin
    update public.document_teaching_uploads
    set source_title = 'Mutated title'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'uploaded document audit row unexpectedly mutated';
  exception
    when object_not_in_prerequisite_state then
      if position('uploaded document teaching sources are immutable' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  begin
    delete from public.document_teaching_uploads
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'uploaded document audit row unexpectedly deleted';
  exception
    when object_not_in_prerequisite_state then
      if position('uploaded document teaching sources are immutable' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end;
$$;

reset role;
rollback;
