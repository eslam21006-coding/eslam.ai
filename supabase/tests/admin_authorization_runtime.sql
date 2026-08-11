begin;

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'admin_users'
      and c.relrowsecurity
  ) then
    raise exception 'admin_users must have RLS enabled';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'client roles must have no admin_users privileges';
  end if;

  if not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'service_role'
      and privilege_type = 'SELECT'
  ) or not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'service_role'
      and privilege_type = 'UPDATE'
  ) then
    raise exception 'service_role must have select and update on admin_users';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'service_role'
      and privilege_type not in ('SELECT', 'UPDATE')
  ) then
    raise exception 'service_role has unnecessary admin_users privileges';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
      and ('anon' = any(roles) or 'authenticated' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'admin_users exposes a client RLS policy';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
      and 'service_role' = any(roles)
  ) <> 2 then
    raise exception 'admin_users must expose exactly two service_role policies';
  end if;

  if not exists (
    select 1 from public.admin_users where email = 'eslam@adscope.net'
  ) then
    raise exception 'primary admin email must be pre-authorized';
  end if;
end
$$;

insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'eslam@adscope.net');

set local role authenticated;
do $$
begin
  begin
    perform email from public.admin_users limit 1;
    raise exception 'authenticated role unexpectedly read admin_users';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

set local role service_role;
update public.admin_users
set user_id = '11111111-1111-4111-8111-111111111111'
where email = 'eslam@adscope.net'
  and user_id is null;

do $$
begin
  if not exists (
    select 1
    from public.admin_users
    where email = 'eslam@adscope.net'
      and user_id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'service_role could not bind primary admin to auth user';
  end if;
end
$$;
reset role;

set local role authenticated;
do $$
begin
  begin
    update public.admin_users
    set user_id = null
    where email = 'eslam@adscope.net';
    raise exception 'authenticated role unexpectedly mutated admin_users';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
