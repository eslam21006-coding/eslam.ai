create table public.business_dna (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_name text,
  business_name text,
  niche text,
  markets text,
  audiences text,
  business_model text,
  offers text,
  price_ranges text,
  positioning text,
  methodology text,
  delivery text,
  team_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.set_business_dna_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_business_dna_updated_at() from public, anon, authenticated;

create trigger set_business_dna_updated_at
before update on public.business_dna
for each row
execute function public.set_business_dna_updated_at();

alter table public.business_dna enable row level security;

revoke all on table public.business_dna from anon;
grant select, insert, update on table public.business_dna to authenticated;

create policy "Users can read their own Business DNA"
  on public.business_dna
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own Business DNA"
  on public.business_dna
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own Business DNA"
  on public.business_dna
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
