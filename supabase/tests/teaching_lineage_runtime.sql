begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['teaching_sources', 'teaching_items', 'teaching_versions'] loop
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       or has_any_column_privilege('anon', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       or has_any_column_privilege('authenticated', format('public.%I', table_name), 'INSERT') then
      raise exception 'client role unexpectedly has teaching lineage privileges on %', table_name;
    end if;

    if not has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       or not has_any_column_privilege('service_role', format('public.%I', table_name), 'INSERT') then
      raise exception 'service_role is missing teaching lineage privileges on %', table_name;
    end if;

    if has_any_column_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') then
      raise exception 'service_role unexpectedly can mutate immutable teaching lineage on %', table_name;
    end if;
  end loop;
end;
$$;

set local role service_role;

do $$
declare
  saved_item_id uuid;
  source_count_before bigint;
  source_count_after bigint;
  teaching_item_count_before bigint;
  teaching_item_count_after bigint;
  teaching_version_count_before bigint;
  teaching_version_count_after bigint;
begin
  saved_item_id := public.create_eslam_brain_draft(
    jsonb_build_object(
      'semantic_layer', 'brain',
      'item_type', 'diagnostic_rule',
      'priority', 64,
      'title', 'Task 16 lineage runtime teaching',
      'content', 'Trace every authoritative teaching to the source and exact Brain version that produced it.',
      'summary', 'Task 16 lineage regression',
      'topics', jsonb_build_array('lineage', 'provenance'),
      'change_note', 'Task 16 runtime test'
    )
  );

  if not exists (
    select 1
    from public.teaching_sources s
    join public.teaching_items ti
      on ti.source_id = s.id
    join public.teaching_versions tv
      on tv.teaching_item_id = ti.id
     and tv.brain_item_id = ti.brain_item_id
    join public.eslam_brain_versions bv
      on bv.item_id = tv.brain_item_id
     and bv.version_number = tv.version_number
    where ti.brain_item_id = saved_item_id
      and s.source_type = 'manual_text'
      and s.title = 'Task 16 lineage runtime teaching'
      and s.source_metadata ->> 'entrypoint' = 'teach_eslam'
      and s.source_metadata ->> 'capture_mode' = 'manual_text'
      and tv.source_locator ->> 'kind' = 'manual_entry'
      and tv.version_number = 1
      and bv.title = 'Task 16 lineage runtime teaching'
  ) then
    raise exception 'Teach Eslam did not create complete source-to-Brain lineage';
  end if;

  select count(*) into source_count_before from public.teaching_sources;
  select count(*) into teaching_item_count_before from public.teaching_items;
  select count(*) into teaching_version_count_before from public.teaching_versions;

  begin
    perform public.create_eslam_brain_draft(
      jsonb_build_object(
        'semantic_layer', 'invalid-layer',
        'item_type', 'principle',
        'priority', 64,
        'title', 'Task 16 rollback teaching',
        'content', 'This call must roll back the source inserted before the invalid Brain item.'
      )
    );
    raise exception 'invalid lineage draft unexpectedly succeeded';
  exception
    when check_violation then
      null;
  end;

  select count(*) into source_count_after from public.teaching_sources;
  select count(*) into teaching_item_count_after from public.teaching_items;
  select count(*) into teaching_version_count_after from public.teaching_versions;

  if source_count_after <> source_count_before
     or teaching_item_count_after <> teaching_item_count_before
     or teaching_version_count_after <> teaching_version_count_before then
    raise exception 'failed Teach Eslam transaction left partial teaching lineage behind';
  end if;
end;
$$;

reset role;

do $$
declare
  saved_source_id uuid;
  saved_teaching_item_id uuid;
  saved_teaching_version_id uuid;
begin
  select s.id, ti.id, tv.id
  into saved_source_id, saved_teaching_item_id, saved_teaching_version_id
  from public.teaching_sources s
  join public.teaching_items ti on ti.source_id = s.id
  join public.teaching_versions tv on tv.teaching_item_id = ti.id
  where s.title = 'Task 16 lineage runtime teaching'
  limit 1;

  begin
    update public.teaching_sources
    set title = 'mutated source'
    where id = saved_source_id;
    raise exception 'teaching source mutation unexpectedly succeeded';
  exception
    when sqlstate '55000' then
      null;
  end;

  begin
    update public.teaching_items
    set source_id = source_id
    where id = saved_teaching_item_id;
    raise exception 'teaching item mutation unexpectedly succeeded';
  exception
    when sqlstate '55000' then
      null;
  end;

  begin
    delete from public.teaching_versions
    where id = saved_teaching_version_id;
    raise exception 'teaching version deletion unexpectedly succeeded';
  exception
    when sqlstate '55000' then
      null;
  end;
end;
$$;

rollback;
