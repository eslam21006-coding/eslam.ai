begin;

do $$
begin
  if has_table_privilege('anon', 'public.eslam_brain_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.eslam_brain_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.eslam_brain_versions', 'SELECT') then
    raise exception 'client role unexpectedly has direct Eslam Brain access';
  end if;

  if not has_table_privilege('service_role', 'public.eslam_brain_items', 'SELECT')
     or not has_table_privilege('service_role', 'public.eslam_brain_items', 'INSERT')
     or not has_table_privilege('service_role', 'public.eslam_brain_items', 'UPDATE')
     or has_table_privilege('service_role', 'public.eslam_brain_items', 'DELETE') then
    raise exception 'service_role item privileges do not match the Task 13 contract';
  end if;

  if not has_table_privilege('service_role', 'public.eslam_brain_versions', 'SELECT')
     or not has_table_privilege('service_role', 'public.eslam_brain_versions', 'INSERT')
     or has_table_privilege('service_role', 'public.eslam_brain_versions', 'UPDATE')
     or has_table_privilege('service_role', 'public.eslam_brain_versions', 'DELETE') then
    raise exception 'service_role version privileges do not match the immutable history contract';
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
end;
$$;

set local role service_role;

insert into public.eslam_brain_items (
  id,
  semantic_layer,
  item_type,
  status,
  priority
) values (
  '13000000-0000-4000-8000-000000000001',
  'brain',
  'principle',
  'draft',
  25
);

insert into public.eslam_brain_versions (
  id,
  item_id,
  version_number,
  title,
  content,
  summary,
  topics,
  change_note
) values (
  '13000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000001',
  1,
  'Find the first broken step',
  'Diagnose the earliest broken step before optimizing downstream symptoms.',
  'Core diagnostic principle',
  array['diagnosis', 'funnel']::text[],
  'Initial canonical version'
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
      and version.title = 'Find the first broken step'
  ) then
    raise exception 'published Eslam Brain item did not resolve deterministically';
  end if;

  begin
    update public.eslam_brain_versions
    set content = 'mutated'
    where item_id = '13000000-0000-4000-8000-000000000001';
    raise exception 'service_role unexpectedly updated immutable brain history';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.eslam_brain_versions
    where item_id = '13000000-0000-4000-8000-000000000001';
    raise exception 'service_role unexpectedly deleted immutable brain history';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.eslam_brain_items
    set published_version_number = 2
    where id = '13000000-0000-4000-8000-000000000001';
    raise exception 'nonexistent published version unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
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

do $$
begin
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

rollback;
