create function public.enforce_admin_user_binding_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    raise exception 'admin authorization email is immutable';
  end if;

  if old.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'admin authorization binding is immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_admin_user_binding_immutability() from public, anon, authenticated, service_role;

create trigger enforce_admin_user_binding_immutability
before update on public.admin_users
for each row
execute function public.enforce_admin_user_binding_immutability();

revoke update on table public.admin_users from service_role;
grant update (user_id) on public.admin_users to service_role;

drop policy "Server can bind admin users" on public.admin_users;

create policy "Server can bind admin users"
  on public.admin_users
  for update
  to service_role
  using (user_id is null)
  with check (user_id is not null);
