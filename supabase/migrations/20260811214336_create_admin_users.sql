create table public.admin_users (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint admin_users_email_normalized check (email = lower(btrim(email))),
  constraint admin_users_email_format check (position('@' in email) > 1)
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_users to service_role;

insert into public.admin_users (email)
values ('eslam@adscope.net')
on conflict (email) do nothing;
