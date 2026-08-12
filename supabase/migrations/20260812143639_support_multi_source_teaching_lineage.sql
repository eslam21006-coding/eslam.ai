alter table public.teaching_items
  drop constraint teaching_items_brain_item_id_key;

create index teaching_items_brain_item_id_idx
  on public.teaching_items (brain_item_id);

alter table public.teaching_sources
  drop constraint teaching_sources_source_type_check;

alter table public.teaching_sources
  add constraint teaching_sources_source_type_check
  check (source_type in ('manual_text', 'voice', 'document', 'legacy'));

do $$
declare
  legacy_item record;
  new_source_id uuid;
  new_teaching_item_id uuid;
begin
  for legacy_item in
    select
      b.id as brain_item_id,
      b.created_by,
      coalesce(
        (
          select v.title
          from public.eslam_brain_versions v
          where v.item_id = b.id
          order by v.version_number asc
          limit 1
        ),
        'Legacy Brain item ' || left(b.id::text, 8)
      ) as source_title
    from public.eslam_brain_items b
    where not exists (
      select 1
      from public.teaching_items ti
      where ti.brain_item_id = b.id
    )
  loop
    insert into public.teaching_sources (
      source_type,
      title,
      source_uri,
      source_metadata,
      created_by
    ) values (
      'legacy',
      legacy_item.source_title,
      null,
      jsonb_build_object(
        'entrypoint', 'pre_lineage_backfill',
        'capture_mode', 'legacy',
        'brain_item_id', legacy_item.brain_item_id
      ),
      legacy_item.created_by
    )
    returning id into new_source_id;

    insert into public.teaching_items (
      source_id,
      brain_item_id,
      created_by
    ) values (
      new_source_id,
      legacy_item.brain_item_id,
      legacy_item.created_by
    )
    returning id into new_teaching_item_id;

    insert into public.teaching_versions (
      teaching_item_id,
      brain_item_id,
      version_number,
      source_locator,
      created_by
    )
    select
      new_teaching_item_id,
      v.item_id,
      v.version_number,
      jsonb_build_object('kind', 'legacy_brain_version'),
      v.created_by
    from public.eslam_brain_versions v
    where v.item_id = legacy_item.brain_item_id
    order by v.version_number asc;
  end loop;
end;
$$;
