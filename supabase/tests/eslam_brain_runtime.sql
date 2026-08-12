begin;

do $$
begin
  if has_table_privilege('anon', 'public.eslam_brain_items', 'SELECT')
     or has_table_privilege('anon', 'public.eslam_brain_versions', 'SELECT')
     or has_table_privilege('authenticated', 'public.eslam_brain_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.eslam_brain_versions', 'SELECT') then
    raise exception 'client role unexpectedly has direct Eslam Brain access';
  end if;

  if not has_table_privilege('service_role', 'public.eslam_brain_items', 'SELECT')
     or has_table_privilege('service_role', 'public.eslam_brain_items', 'INSERT')
     or has_table_privilege('service_role', 'public.eslam_brain_items', 'UPDATE')
     or has_table_privilege('service_role', 'public.eslam_brain_items', 'DELETE') then
    raise exception 'service_role item table privileges do not match the column-scoped contract';
  end if;

  if not has_column_privilege('service_role', 'public.eslam_brain_items', 'semantic_layer', 'INSERT')
     or not has_column_privilege('service_role', 'public.eslam_brain_items', 'status', 'UPDATE')
     or has_column_privilege('service_role', 'public.eslam_brain_items', 'id', 'INSERT')
     or has_column_privilege('service_role', 'public.eslam_brain_items', 'created_at', 'UPDATE') then
    raise exception 'service_role item column privileges do not match the Task 13 contract';
  end if;

  if not has_table_privilege('service_role', 'public.eslam_brain_versions', 'SELECT')
     or has_table_privilege('service_role', 'public.eslam_brain_versions', 'INSERT')
     or has_table_privilege('service_role', 'public.eslam_brain_versions', 'UPDATE')
     or has_table_privilege('service_role', 'public.eslam_brain_versions', 'DELETE') then
    raise exception 'service_role version table privileges do not match the immutable history contract';
  end if;

  if not has_column_privilege('service_role', 'public.eslam_brain_versions', 'content', 'INSERT')
     or has_column_privilege('service_role', 'public.eslam_brain_versions', 'id', 'INSERT')
     or has_column_privilege('service_role', 'public.eslam_brain_versions', 'created_at', 'INSERT') then
    raise exception 'service_role version insert columns do not match the immutable history contract';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'eslam_brain_items'
      and c.relrowsecurity
  ) or not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'eslam_brain_versions'
      and c.relrowsecurity
  ) then
    raise exception 'Eslam Brain RLS is not enabled';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.eslam_brain_versions'::regclass
      and contype = 'f'
      and conname = 'eslam_brain_versions_created_by_fkey'
  ) then
    raise exception 'immutable version provenance still depends on mutable Auth user lifetime';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  saved_item_id uuid;
begin
  insert into public.eslam_brain_items (
    semantic_layer,
    item_type,
    status,
    priority
  ) values (
    'brain',
    'principle',
    'draft',
    25
  )
  returning id into saved_item_id;

  insert into public.eslam_brain_versions (
    item_id,
    version_number,
    title,
    content,
    summary,
    topics,
    change_note
  ) values (
    saved_item_id,
    1,
    'Find the first broken step',
    'Diagnose the earliest broken step before optimizing downstream symptoms.',
    'Core diagnostic principle',
    array['diagnosis', 'funnel']::text[],
    'Initial canonical version'
  );

  update public.eslam_brain_items
  set status = 'published', published_version_number = 1
  where id = saved_item_id;

  if not found then
    raise exception 'service_role publication update did not affect the created item';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_items item
    join public.eslam_brain_versions version
      on version.item_id = item.id
     and version.version_number = item.published_version_number
    where item.id = saved_item_id
      and item.status = 'published'
      and version.title = 'Find the first broken step'
  ) then
    raise exception 'service_role publication flow did not produce a resolvable published item';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.eslam_brain_items (id, semantic_layer, item_type, status)
    values (gen_random_uuid(), 'brain', 'principle', 'draft');
    raise exception 'service_role unexpectedly supplied canonical item id';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.eslam_brain_versions (
      id,
      item_id,
      version_number,
      title,
      content
    ) values (
      gen_random_uuid(),
      gen_random_uuid(),
      1,
      'Forbidden id insert',
      'The service role must not control immutable row identifiers.'
    );
    raise exception 'service_role unexpectedly supplied immutable version id';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.eslam_brain_items (semantic_layer, item_type, status)
    values ('knowledge', 'principle', 'draft');
    raise exception 'invalid semantic layer unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.eslam_brain_items (semantic_layer, item_type, status)
    values ('brain', 'unsupported_type', 'draft');
    raise exception 'invalid brain item type unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.eslam_brain_items (semantic_layer, item_type, status)
    values ('brain', 'principle', 'published');
    raise exception 'published item without version unexpectedly succeeded';
  exception
    when check_violation then null;
  end;
end;
$$;

reset role;

insert into auth.users (id, email)
values ('13000000-0000-4000-8000-000000000010', 'brain-author@example.com');

insert into public.eslam_brain_items (
  id,
  semantic_layer,
  item_type,
  status,
  priority,
  created_by
) values (
  '13000000-0000-4000-8000-000000000001',
  'brain',
  'principle',
  'draft',
  25,
  '13000000-0000-4000-8000-000000000010'
);

insert into public.eslam_brain_versions (
  id,
  item_id,
  version_number,
  title,
  content,
  summary,
  topics,
  change_note,
  created_by
) values (
  '13000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000001',
  1,
  'Immutable provenance verification',
  'Published versions retain their creator UUID even if the Auth account is later removed.',
  'Provenance verification',
  array['provenance']::text[],
  'Runtime verification',
  '13000000-0000-4000-8000-000000000010'
);

update public.eslam_brain_items
set status = 'published', published_version_number = 1
where id = '13000000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1
    from public.eslam_brain_items item
    join public.eslam_brain_versions version
      on version.item_id = item.id
     and version.version_number = item.published_version_number
    where item.id = '13000000-0000-4000-8000-000000000001'
      and item.status = 'published'
      and item.semantic_layer = 'brain'
      and item.item_type = 'principle'
      and version.title = 'Immutable provenance verification'
  ) then
    raise exception 'published Eslam Brain item did not resolve deterministically';
  end if;

  begin
    update public.eslam_brain_items
    set published_version_number = 2
    where id = '13000000-0000-4000-8000-000000000001';
    raise exception 'nonexistent published version unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    update public.eslam_brain_versions
    set content = 'privileged mutation attempt'
    where item_id = '13000000-0000-4000-8000-000000000001';
    raise exception 'immutable brain version trigger did not reject UPDATE';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    delete from public.eslam_brain_versions
    where item_id = '13000000-0000-4000-8000-000000000001';
    raise exception 'immutable brain version trigger did not reject DELETE';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

delete from auth.users
where id = '13000000-0000-4000-8000-000000000010';

do $$
begin
  if not exists (
    select 1
    from public.eslam_brain_versions
    where item_id = '13000000-0000-4000-8000-000000000001'
      and created_by = '13000000-0000-4000-8000-000000000010'
  ) then
    raise exception 'immutable version creator provenance was not preserved after Auth user deletion';
  end if;
end;
$$;

rollback;
