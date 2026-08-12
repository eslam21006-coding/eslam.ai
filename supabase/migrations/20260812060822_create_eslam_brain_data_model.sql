create table public.eslam_brain_items (
  id uuid primary key default gen_random_uuid(),
  semantic_layer text not null
    check (semantic_layer in ('identity', 'brain', 'cases', 'voice')),
  item_type text not null
    check (item_type in (
      'identity_fact',
      'principle',
      'diagnostic_rule',
      'framework',
      'hard_rule',
      'example',
      'correction',
      'contraindication',
      'voice_rule'
    )),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'published', 'archived')),
  priority smallint not null default 100
    check (priority between 0 and 1000),
  published_version_number integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eslam_brain_items_published_version_positive
    check (published_version_number is null or published_version_number > 0),
  constraint eslam_brain_items_published_requires_version
    check (status <> 'published' or published_version_number is not null)
);

create table public.eslam_brain_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.eslam_brain_items(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  title text not null
    check (char_length(btrim(title)) between 1 and 200),
  content text not null
    check (char_length(btrim(content)) between 1 and 16000),
  summary text
    check (summary is null or char_length(summary) <= 1200),
  topics text[] not null default '{}'::text[],
  change_note text
    check (change_note is null or char_length(change_note) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint eslam_brain_versions_item_version_unique
    unique (item_id, version_number)
);

alter table public.eslam_brain_items
  add constraint eslam_brain_items_published_version_fk
  foreign key (id, published_version_number)
  references public.eslam_brain_versions(item_id, version_number)
  on update restrict
  on delete restrict;

create index eslam_brain_items_published_lookup_idx
  on public.eslam_brain_items (semantic_layer, priority, id)
  where status = 'published';

create index eslam_brain_versions_item_created_idx
  on public.eslam_brain_versions (item_id, version_number desc);

create or replace function public.touch_eslam_brain_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_eslam_brain_item_updated_at
before update on public.eslam_brain_items
for each row
execute function public.touch_eslam_brain_item_updated_at();

create or replace function public.prevent_eslam_brain_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'eslam brain versions are immutable' using errcode = '55000';
end;
$$;

create trigger prevent_eslam_brain_version_update
before update on public.eslam_brain_versions
for each row
execute function public.prevent_eslam_brain_version_mutation();

create trigger prevent_eslam_brain_version_delete
before delete on public.eslam_brain_versions
for each row
execute function public.prevent_eslam_brain_version_mutation();

alter table public.eslam_brain_items enable row level security;
alter table public.eslam_brain_versions enable row level security;

revoke all on table public.eslam_brain_items from public, anon, authenticated, service_role;
revoke all on table public.eslam_brain_versions from public, anon, authenticated, service_role;

grant select, insert, update on table public.eslam_brain_items to service_role;
grant select, insert on table public.eslam_brain_versions to service_role;

create policy "Service role reads Eslam brain items"
on public.eslam_brain_items
for select
to service_role
using (true);

create policy "Service role inserts Eslam brain items"
on public.eslam_brain_items
for insert
to service_role
with check (true);

create policy "Service role updates Eslam brain items"
on public.eslam_brain_items
for update
to service_role
using (true)
with check (true);

create policy "Service role reads Eslam brain versions"
on public.eslam_brain_versions
for select
to service_role
using (true);

create policy "Service role inserts Eslam brain versions"
on public.eslam_brain_versions
for insert
to service_role
with check (true);

revoke all on function public.touch_eslam_brain_item_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.prevent_eslam_brain_version_mutation() from public, anon, authenticated, service_role;
