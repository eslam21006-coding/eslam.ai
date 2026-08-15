begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  (
    '33333333-3333-4333-8333-333333333333',
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

update public.knowledge_library_config
set vector_store_id = 'vs_test', updated_at = now()
where library_key = 'global';

update public.knowledge_sources
set status = 'indexing',
    size_bytes = 4096,
    openai_file_id = 'file_test',
    vector_store_id = 'vs_test',
    updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

update public.knowledge_sources
set status = 'ready',
    indexed_at = now(),
    updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
begin
  if not exists (
    select 1 from public.knowledge_sources
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and status = 'ready'
      and size_bytes = 4096
      and openai_file_id = 'file_test'
      and vector_store_id = 'vs_test'
      and indexed_at is not null
  ) then
    raise exception 'Knowledge source did not reach valid ready state';
  end if;

  if exists (
    select 1 from public.teaching_sources
    where created_by = '33333333-3333-4333-8333-333333333333'
  ) then
    raise exception 'Knowledge Library unexpectedly created a teaching source';
  end if;

  if exists (
    select 1 from public.eslam_brain_items
    where created_by = '33333333-3333-4333-8333-333333333333'
  ) then
    raise exception 'Knowledge Library unexpectedly created Brain content';
  end if;
end;
$$;

update public.knowledge_sources
set status = 'deleting', updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

delete from public.knowledge_sources
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

reset role;
rollback;
