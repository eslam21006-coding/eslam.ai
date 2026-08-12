begin;

do $$
begin
  if has_function_privilege('anon', 'public.create_eslam_brain_draft(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_eslam_brain_draft(jsonb)', 'EXECUTE') then
    raise exception 'client role unexpectedly can execute Teach Eslam draft RPC';
  end if;

  if not has_function_privilege('service_role', 'public.create_eslam_brain_draft(jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot execute Teach Eslam draft RPC';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  saved_item_id uuid;
  item_count_before bigint;
  item_count_after bigint;
begin
  saved_item_id := public.create_eslam_brain_draft(
    jsonb_build_object(
      'semantic_layer', 'brain',
      'item_type', 'principle',
      'priority', 77,
      'title', 'Teach Eslam runtime principle',
      'content', 'Diagnose the earliest broken step before optimizing downstream symptoms.',
      'summary', 'Runtime regression item',
      'topics', jsonb_build_array('diagnosis', 'funnel'),
      'change_note', 'Task 15 runtime test'
    )
  );

  if not exists (
    select 1
    from public.eslam_brain_items
    where id = saved_item_id
      and status = 'draft'
      and published_version_number is null
      and priority = 77
  ) then
    raise exception 'Teach Eslam RPC did not create the expected draft item';
  end if;

  if not exists (
    select 1
    from public.eslam_brain_versions
    where item_id = saved_item_id
      and version_number = 1
      and title = 'Teach Eslam runtime principle'
      and topics = array['diagnosis', 'funnel']::text[]
  ) then
    raise exception 'Teach Eslam RPC did not create immutable version 1';
  end if;

  select count(*) into item_count_before from public.eslam_brain_items;

  begin
    perform public.create_eslam_brain_draft(
      jsonb_build_object(
        'semantic_layer', 'voice',
        'item_type', 'voice_rule',
        'priority', 998,
        'title', repeat('x', 201),
        'content', 'This version insert must fail.'
      )
    );
    raise exception 'invalid Teach Eslam draft unexpectedly succeeded';
  exception
    when check_violation then
      null;
  end;

  select count(*) into item_count_after from public.eslam_brain_items;
  if item_count_after <> item_count_before then
    raise exception 'failed version insert left a partial Brain item behind';
  end if;

  update public.eslam_brain_items
  set status = 'published', published_version_number = 1
  where id = saved_item_id;

  if not exists (
    select 1
    from public.eslam_brain_items i
    join public.eslam_brain_versions v
      on v.item_id = i.id
     and v.version_number = i.published_version_number
    where i.id = saved_item_id
      and i.status = 'published'
      and i.published_version_number = 1
  ) then
    raise exception 'Teach Eslam draft could not be published through immutable version pointer';
  end if;
end;
$$;

reset role;
rollback;
