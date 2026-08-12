begin;

insert into auth.users (id, email)
values ('22222222-2222-4222-8222-222222222222', 'task17@example.test');

do $$
begin
  if has_function_privilege('anon', 'public.create_eslam_brain_review_version(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_eslam_brain_review_version(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.review_eslam_brain_item(uuid,uuid,text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.review_eslam_brain_item(uuid,uuid,text,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.bulk_approve_eslam_brain_items(uuid[],uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.bulk_approve_eslam_brain_items(uuid[],uuid)', 'EXECUTE') then
    raise exception 'client role unexpectedly can execute teaching review RPCs';
  end if;

  if not has_function_privilege('service_role', 'public.create_eslam_brain_review_version(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.review_eslam_brain_item(uuid,uuid,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.bulk_approve_eslam_brain_items(uuid[],uuid)', 'EXECUTE') then
    raise exception 'service_role is missing teaching review RPC access';
  end if;

  if has_column_privilege('anon', 'public.eslam_brain_items', 'approved_version_number', 'UPDATE')
     or has_column_privilege('authenticated', 'public.eslam_brain_items', 'approved_version_number', 'UPDATE') then
    raise exception 'client role unexpectedly can update approved version pointer';
  end if;

  if not has_column_privilege('service_role', 'public.eslam_brain_items', 'approved_version_number', 'UPDATE') then
    raise exception 'service_role cannot update approved version pointer';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  user_id constant uuid := '22222222-2222-4222-8222-222222222222';
  item_id uuid;
  bulk_a uuid;
  bulk_b uuid;
  missing_id uuid := '33333333-3333-4333-8333-333333333333';
  new_version integer;
  result_status text;
  bulk_count integer;
  version_count_before bigint;
  version_count_after bigint;
begin
  item_id := public.create_eslam_brain_draft(jsonb_build_object(
    'semantic_layer', 'brain',
    'item_type', 'principle',
    'priority', 100,
    'title', 'Task 17 runtime v1',
    'content', 'Original immutable content',
    'summary', 'Original summary',
    'topics', jsonb_build_array('review'),
    'change_note', 'Initial version',
    'created_by', user_id
  ));

  new_version := public.create_eslam_brain_review_version(jsonb_build_object(
    'item_id', item_id,
    'created_by', user_id,
    'expected_version_number', 1,
    'semantic_layer', 'cases',
    'item_type', 'example',
    'priority', 55,
    'title', 'Task 17 runtime v2',
    'content', 'Reviewed content',
    'summary', 'Reviewed summary',
    'topics', jsonb_build_array('review', 'edited'),
    'change_note', 'Reclassified during review'
  ));

  if new_version <> 2 then
    raise exception 'review edit did not create version 2';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_versions
    where item_id = item_id
      and version_number = 1
      and title = 'Task 17 runtime v1'
      and content = 'Original immutable content'
  ) then
    raise exception 'review edit mutated or removed version 1';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_items i
    where i.id = item_id
      and i.status = 'draft'
      and i.semantic_layer = 'cases'
      and i.item_type = 'example'
      and i.priority = 55
      and i.approved_version_number is null
  ) then
    raise exception 'review edit did not update draft classification';
  end if;

  if not exists (
    select 1
    from public.teaching_versions tv
    join public.teaching_items ti
      on ti.id = tv.teaching_item_id
     and ti.brain_item_id = tv.brain_item_id
    join public.teaching_sources s
      on s.id = ti.source_id
    where tv.brain_item_id = item_id
      and tv.version_number = 2
      and s.source_type = 'manual_text'
      and s.source_metadata ->> 'entrypoint' = 'teaching_review'
      and s.source_metadata ->> 'capture_mode' = 'review_edit'
      and tv.source_locator ->> 'kind' = 'review_edit'
  ) then
    raise exception 'review edit did not create version-specific provenance';
  end if;

  select count(*) into version_count_before
  from public.eslam_brain_versions
  where item_id = item_id;

  begin
    perform public.create_eslam_brain_review_version(jsonb_build_object(
      'item_id', item_id,
      'created_by', user_id,
      'expected_version_number', 1,
      'semantic_layer', 'brain',
      'item_type', 'principle',
      'priority', 100,
      'title', 'Stale edit',
      'content', 'Must fail because v2 already exists'
    ));
    raise exception 'stale review edit unexpectedly succeeded';
  exception
    when sqlstate '40001' then
      null;
  end;

  select count(*) into version_count_after
  from public.eslam_brain_versions
  where item_id = item_id;

  if version_count_after <> version_count_before then
    raise exception 'stale review edit left a partial version behind';
  end if;

  result_status := public.review_eslam_brain_item(item_id, user_id, 'approve', 2);
  if result_status <> 'approved' then
    raise exception 'draft approval failed';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_items
    where id = item_id
      and status = 'approved'
      and approved_version_number = 2
      and published_version_number is null
  ) then
    raise exception 'approval did not bind exact version 2';
  end if;

  begin
    perform public.create_eslam_brain_review_version(jsonb_build_object(
      'item_id', item_id,
      'created_by', user_id,
      'expected_version_number', 2,
      'semantic_layer', 'cases',
      'item_type', 'example',
      'priority', 55,
      'title', 'Edit after approval',
      'content', 'Must fail because approved teachings are frozen'
    ));
    raise exception 'approved teaching edit unexpectedly succeeded';
  exception
    when sqlstate '55000' then
      null;
  end;

  result_status := public.review_eslam_brain_item(item_id, user_id, 'publish', 2);
  if result_status <> 'published' then
    raise exception 'approved version publication failed';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_items
    where id = item_id
      and status = 'published'
      and approved_version_number = 2
      and published_version_number = 2
  ) then
    raise exception 'publication did not preserve approved version pointer';
  end if;

  result_status := public.review_eslam_brain_item(item_id, user_id, 'archive', 2);
  if result_status <> 'archived' then
    raise exception 'published teaching archive failed';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_items
    where id = item_id
      and status = 'archived'
      and published_version_number = 2
  ) then
    raise exception 'archive did not preserve historical publication pointer';
  end if;

  bulk_a := public.create_eslam_brain_draft(jsonb_build_object(
    'semantic_layer', 'brain',
    'item_type', 'principle',
    'priority', 100,
    'title', 'Bulk runtime A',
    'content', 'Bulk A content',
    'created_by', user_id
  ));

  bulk_b := public.create_eslam_brain_draft(jsonb_build_object(
    'semantic_layer', 'voice',
    'item_type', 'voice_rule',
    'priority', 200,
    'title', 'Bulk runtime B',
    'content', 'Bulk B content',
    'created_by', user_id
  ));

  begin
    perform public.bulk_approve_eslam_brain_items(array[bulk_a, missing_id], user_id);
    raise exception 'partial bulk approval unexpectedly succeeded';
  exception
    when sqlstate '55000' then
      null;
  end;

  if not exists (
    select 1
    from public.eslam_brain_items
    where id = bulk_a and status = 'draft' and approved_version_number is null
  ) then
    raise exception 'failed bulk approval partially mutated an eligible draft';
  end if;

  bulk_count := public.bulk_approve_eslam_brain_items(array[bulk_a, bulk_b], user_id);
  if bulk_count <> 2 then
    raise exception 'bulk approval count mismatch';
  end if;

  if (
    select count(*)
    from public.eslam_brain_items
    where id in (bulk_a, bulk_b)
      and status = 'approved'
      and approved_version_number = 1
  ) <> 2 then
    raise exception 'bulk approval did not bind the latest version for every draft';
  end if;
end;
$$;

reset role;
rollback;
