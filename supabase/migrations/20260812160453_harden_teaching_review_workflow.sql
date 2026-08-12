create or replace function public.create_eslam_brain_review_version(p_payload jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_created_by uuid;
  v_expected_version_text text;
  v_priority_text text;
  v_expected_version_number integer;
  v_latest_version_number integer;
  v_new_version_number integer;
  v_semantic_layer text;
  v_item_type text;
  v_priority integer;
  v_title text;
  v_content text;
  v_summary text;
  v_change_note text;
  v_topics text[];
  v_source_id uuid;
  v_teaching_item_id uuid;
  v_status text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'review payload must be a JSON object' using errcode = '22023';
  end if;

  v_item_id := nullif(p_payload ->> 'item_id', '')::uuid;
  v_created_by := nullif(p_payload ->> 'created_by', '')::uuid;
  v_expected_version_text := p_payload ->> 'expected_version_number';
  v_priority_text := p_payload ->> 'priority';

  if coalesce(v_expected_version_text, '') !~ '^[0-9]+$'
     or coalesce(v_priority_text, '') !~ '^[0-9]+$' then
    raise exception 'invalid numeric review input' using errcode = '22023';
  end if;

  v_expected_version_number := v_expected_version_text::integer;
  v_semantic_layer := btrim(coalesce(p_payload ->> 'semantic_layer', ''));
  v_item_type := btrim(coalesce(p_payload ->> 'item_type', ''));
  v_priority := v_priority_text::integer;
  v_title := btrim(coalesce(p_payload ->> 'title', ''));
  v_content := btrim(coalesce(p_payload ->> 'content', ''));
  v_summary := nullif(btrim(coalesce(p_payload ->> 'summary', '')), '');
  v_change_note := nullif(btrim(coalesce(p_payload ->> 'change_note', '')), '');

  if jsonb_typeof(coalesce(p_payload -> 'topics', '[]'::jsonb)) <> 'array' then
    raise exception 'topics must be a JSON array' using errcode = '22023';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into v_topics
  from jsonb_array_elements_text(coalesce(p_payload -> 'topics', '[]'::jsonb)) as topic(value);

  if v_item_id is null or v_created_by is null or v_expected_version_number <= 0 then
    raise exception 'invalid review identity or expected version' using errcode = '22023';
  end if;

  if v_semantic_layer not in ('identity', 'brain', 'cases', 'voice') then
    raise exception 'invalid semantic layer' using errcode = '23514';
  end if;

  if v_item_type not in (
    'identity_fact', 'principle', 'diagnostic_rule', 'framework', 'hard_rule',
    'example', 'correction', 'contraindication', 'voice_rule'
  ) then
    raise exception 'invalid item type' using errcode = '23514';
  end if;

  if v_priority < 0 or v_priority > 1000 then
    raise exception 'invalid priority' using errcode = '23514';
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 200
     or char_length(v_content) < 1 or char_length(v_content) > 16000
     or (v_summary is not null and char_length(v_summary) > 1200)
     or (v_change_note is not null and char_length(v_change_note) > 1000)
     or cardinality(v_topics) > 12
     or exists (select 1 from unnest(v_topics) as topic where char_length(topic) > 120) then
    raise exception 'invalid review teaching content' using errcode = '23514';
  end if;

  select status
  into v_status
  from public.eslam_brain_items
  where id = v_item_id
    and created_by = v_created_by
  for update;

  if not found then
    raise exception 'brain item not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'only draft teachings can be edited' using errcode = '55000';
  end if;

  select max(version_number)
  into v_latest_version_number
  from public.eslam_brain_versions
  where item_id = v_item_id;

  if v_latest_version_number is null or v_latest_version_number <> v_expected_version_number then
    raise exception 'stale teaching version' using errcode = '40001';
  end if;

  v_new_version_number := v_latest_version_number + 1;

  insert into public.eslam_brain_versions (
    item_id,
    version_number,
    title,
    content,
    summary,
    topics,
    change_note,
    created_by
  )
  values (
    v_item_id,
    v_new_version_number,
    v_title,
    v_content,
    v_summary,
    v_topics,
    v_change_note,
    v_created_by
  );

  -- Carry forward every contributing source from the version being edited so
  -- the new immutable version preserves its complete provenance ancestry.
  insert into public.teaching_versions (
    teaching_item_id,
    brain_item_id,
    version_number,
    source_locator,
    created_by
  )
  select
    tv.teaching_item_id,
    tv.brain_item_id,
    v_new_version_number,
    tv.source_locator || jsonb_build_object('inherited_from_version', v_expected_version_number),
    v_created_by
  from public.teaching_versions tv
  where tv.brain_item_id = v_item_id
    and tv.version_number = v_expected_version_number;

  insert into public.teaching_sources (
    source_type,
    title,
    source_metadata,
    created_by
  )
  values (
    'manual_text',
    v_title,
    jsonb_build_object(
      'entrypoint', 'teaching_review',
      'capture_mode', 'review_edit',
      'previous_version_number', v_expected_version_number
    ),
    v_created_by
  )
  returning id into v_source_id;

  insert into public.teaching_items (
    source_id,
    brain_item_id,
    created_by
  )
  values (
    v_source_id,
    v_item_id,
    v_created_by
  )
  returning id into v_teaching_item_id;

  insert into public.teaching_versions (
    teaching_item_id,
    brain_item_id,
    version_number,
    source_locator,
    created_by
  )
  values (
    v_teaching_item_id,
    v_item_id,
    v_new_version_number,
    jsonb_build_object(
      'kind', 'review_edit',
      'previous_version_number', v_expected_version_number
    ),
    v_created_by
  );

  update public.eslam_brain_items
  set semantic_layer = v_semantic_layer,
      item_type = v_item_type,
      priority = v_priority,
      approved_version_number = null
  where id = v_item_id;

  return v_new_version_number;
end;
$$;

create or replace function public.bulk_approve_eslam_brain_items(
  p_item_ids uuid[],
  p_created_by uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requested_count integer;
  v_owned_count integer;
  v_eligible_count integer;
begin
  if p_created_by is null or p_item_ids is null then
    raise exception 'invalid bulk approval request' using errcode = '22023';
  end if;

  select count(*)
  into v_requested_count
  from (select distinct id from unnest(p_item_ids) as requested(id) where id is not null) as distinct_ids;

  if v_requested_count < 1 or v_requested_count > 50 then
    raise exception 'bulk approval requires between 1 and 50 unique items' using errcode = '22023';
  end if;

  perform 1
  from public.eslam_brain_items i
  join (select distinct id from unnest(p_item_ids) as requested(id) where id is not null) r
    on r.id = i.id
  where i.created_by = p_created_by
  order by i.id
  for update of i;

  get diagnostics v_owned_count = row_count;

  if v_owned_count <> v_requested_count then
    raise exception 'one or more brain items were not found for this owner' using errcode = 'P0002';
  end if;

  with requested as (
    select distinct id
    from unnest(p_item_ids) as requested(id)
    where id is not null
  ), latest as (
    select i.id, max(v.version_number) as version_number
    from public.eslam_brain_items i
    join requested r on r.id = i.id
    join public.eslam_brain_versions v on v.item_id = i.id
    where i.created_by = p_created_by
      and i.status = 'draft'
    group by i.id
  )
  update public.eslam_brain_items i
  set status = 'approved',
      approved_version_number = latest.version_number
  from latest
  where i.id = latest.id;

  get diagnostics v_eligible_count = row_count;

  if v_eligible_count <> v_requested_count then
    raise exception 'one or more teachings are not eligible for bulk approval' using errcode = '55000';
  end if;

  return v_eligible_count;
end;
$$;

create or replace function public.publish_eslam_brain_draft_direct(
  p_item_id uuid,
  p_created_by uuid,
  p_version_number integer
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_latest_version_number integer;
begin
  if p_item_id is null or p_created_by is null or p_version_number is null or p_version_number <= 0 then
    raise exception 'invalid direct publish request' using errcode = '22023';
  end if;

  select status
  into v_status
  from public.eslam_brain_items
  where id = p_item_id
    and created_by = p_created_by
  for update;

  if not found then
    raise exception 'brain item not found' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' then
    raise exception 'only draft teachings can be published directly' using errcode = '55000';
  end if;

  select max(version_number)
  into v_latest_version_number
  from public.eslam_brain_versions
  where item_id = p_item_id;

  if v_latest_version_number is null or v_latest_version_number <> p_version_number then
    raise exception 'stale teaching version' using errcode = '40001';
  end if;

  if p_version_number <> 1 then
    raise exception 'edited drafts must use the review lifecycle' using errcode = '55000';
  end if;

  update public.eslam_brain_items
  set status = 'published',
      approved_version_number = p_version_number,
      published_version_number = p_version_number
  where id = p_item_id;

  return 'published';
end;
$$;

-- Backfill inherited provenance for any review edits that may have been created
-- before this hardening migration was applied. Process in version order so each
-- review version inherits the complete ancestry assembled on its predecessor.
do $$
declare
  review_version record;
begin
  for review_version in
    select distinct tv.brain_item_id, tv.version_number
    from public.teaching_versions tv
    where tv.source_locator ->> 'kind' = 'review_edit'
      and tv.version_number > 1
    order by tv.brain_item_id, tv.version_number
  loop
    insert into public.teaching_versions (
      teaching_item_id,
      brain_item_id,
      version_number,
      source_locator,
      created_by
    )
    select
      previous.teaching_item_id,
      previous.brain_item_id,
      review_version.version_number,
      previous.source_locator || jsonb_build_object('inherited_from_version', review_version.version_number - 1),
      previous.created_by
    from public.teaching_versions previous
    where previous.brain_item_id = review_version.brain_item_id
      and previous.version_number = review_version.version_number - 1
    on conflict (teaching_item_id, version_number) do nothing;
  end loop;
end;
$$;

revoke all on function public.publish_eslam_brain_draft_direct(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_eslam_brain_draft_direct(uuid, uuid, integer)
  to service_role;
