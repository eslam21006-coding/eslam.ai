create table public.teaching_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('manual_text', 'voice', 'document')),
  title text not null
    check (char_length(btrim(title)) between 1 and 200),
  source_uri text
    check (source_uri is null or char_length(btrim(source_uri)) between 1 and 2048),
  source_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metadata) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.teaching_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.teaching_sources(id) on delete restrict,
  brain_item_id uuid not null unique references public.eslam_brain_items(id) on delete restrict,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint teaching_items_id_brain_item_unique unique (id, brain_item_id)
);

create table public.teaching_versions (
  id uuid primary key default gen_random_uuid(),
  teaching_item_id uuid not null,
  brain_item_id uuid not null,
  version_number integer not null check (version_number > 0),
  source_locator jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_locator) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint teaching_versions_item_version_unique
    unique (teaching_item_id, version_number),
  constraint teaching_versions_teaching_item_brain_item_fk
    foreign key (teaching_item_id, brain_item_id)
    references public.teaching_items(id, brain_item_id)
    on update restrict
    on delete restrict,
  constraint teaching_versions_brain_version_fk
    foreign key (brain_item_id, version_number)
    references public.eslam_brain_versions(item_id, version_number)
    on update restrict
    on delete restrict
);

create index teaching_items_source_id_idx
  on public.teaching_items (source_id);

create index teaching_versions_brain_version_idx
  on public.teaching_versions (brain_item_id, version_number);

create or replace function public.prevent_teaching_lineage_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'teaching lineage records are immutable' using errcode = '55000';
end;
$$;

create trigger prevent_teaching_source_update
before update on public.teaching_sources
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_teaching_source_delete
before delete on public.teaching_sources
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_teaching_item_update
before update on public.teaching_items
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_teaching_item_delete
before delete on public.teaching_items
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_teaching_version_update
before update on public.teaching_versions
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_teaching_version_delete
before delete on public.teaching_versions
for each row
execute function public.prevent_teaching_lineage_mutation();

alter table public.teaching_sources enable row level security;
alter table public.teaching_items enable row level security;
alter table public.teaching_versions enable row level security;

revoke all on table public.teaching_sources from public, anon, authenticated, service_role;
revoke all on table public.teaching_items from public, anon, authenticated, service_role;
revoke all on table public.teaching_versions from public, anon, authenticated, service_role;

grant select on table public.teaching_sources to service_role;
grant insert (source_type, title, source_uri, source_metadata, created_by)
  on table public.teaching_sources to service_role;

grant select on table public.teaching_items to service_role;
grant insert (source_id, brain_item_id, created_by)
  on table public.teaching_items to service_role;

grant select on table public.teaching_versions to service_role;
grant insert (teaching_item_id, brain_item_id, version_number, source_locator, created_by)
  on table public.teaching_versions to service_role;

create policy "Service role reads teaching sources"
on public.teaching_sources
for select
to service_role
using (true);

create policy "Service role inserts teaching sources"
on public.teaching_sources
for insert
to service_role
with check (true);

create policy "Service role reads teaching items"
on public.teaching_items
for select
to service_role
using (true);

create policy "Service role inserts teaching items"
on public.teaching_items
for insert
to service_role
with check (true);

create policy "Service role reads teaching versions"
on public.teaching_versions
for select
to service_role
using (true);

create policy "Service role inserts teaching versions"
on public.teaching_versions
for insert
to service_role
with check (true);

revoke all on function public.prevent_teaching_lineage_mutation()
from public, anon, authenticated, service_role;

create or replace function public.create_eslam_brain_draft(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_source_id uuid;
  new_item_id uuid;
  new_teaching_item_id uuid;
  created_by_id uuid;
  normalized_topics text[];
begin
  created_by_id := nullif(p_payload ->> 'created_by', '')::uuid;
  normalized_topics := array(
    select jsonb_array_elements_text(coalesce(p_payload -> 'topics', '[]'::jsonb))
  );

  insert into public.teaching_sources (
    source_type,
    title,
    source_uri,
    source_metadata,
    created_by
  ) values (
    'manual_text',
    p_payload ->> 'title',
    null,
    jsonb_build_object(
      'entrypoint', 'teach_eslam',
      'capture_mode', 'manual_text'
    ),
    created_by_id
  )
  returning id into new_source_id;

  insert into public.eslam_brain_items (
    semantic_layer,
    item_type,
    status,
    priority,
    created_by
  ) values (
    p_payload ->> 'semantic_layer',
    p_payload ->> 'item_type',
    'draft',
    (p_payload ->> 'priority')::smallint,
    created_by_id
  )
  returning id into new_item_id;

  insert into public.eslam_brain_versions (
    item_id,
    version_number,
    title,
    content,
    summary,
    topics,
    change_note,
    created_by
  ) values (
    new_item_id,
    1,
    p_payload ->> 'title',
    p_payload ->> 'content',
    nullif(p_payload ->> 'summary', ''),
    normalized_topics,
    nullif(p_payload ->> 'change_note', ''),
    created_by_id
  );

  insert into public.teaching_items (
    source_id,
    brain_item_id,
    created_by
  ) values (
    new_source_id,
    new_item_id,
    created_by_id
  )
  returning id into new_teaching_item_id;

  insert into public.teaching_versions (
    teaching_item_id,
    brain_item_id,
    version_number,
    source_locator,
    created_by
  ) values (
    new_teaching_item_id,
    new_item_id,
    1,
    jsonb_build_object('kind', 'manual_entry'),
    created_by_id
  );

  return new_item_id;
end;
$$;

revoke execute on function public.create_eslam_brain_draft(jsonb)
from public, anon, authenticated;

grant execute on function public.create_eslam_brain_draft(jsonb)
to service_role;
