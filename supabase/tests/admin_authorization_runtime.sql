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
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) or exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'client roles or PUBLIC must have no admin_users privileges';
  end if;

  if not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'service_role'
      and privilege_type = 'SELECT'
  ) then
    raise exception 'service_role must be able to read admin_users';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'service_role'
      and privilege_type <> 'SELECT'
  ) then
    raise exception 'service_role has unnecessary table-level admin_users privileges';
  end if;

  if not exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'service_role'
      and privilege_type = 'UPDATE'
      and column_name = 'user_id'
  ) or exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'admin_users'
      and grantee = 'service_role'
      and privilege_type = 'UPDATE'
      and column_name <> 'user_id'
  ) then
    raise exception 'service_role UPDATE must be limited to admin_users.user_id';
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
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
      and policyname = 'Server can bind admin users'
      and cmd = 'UPDATE'
      and qual like '%user_id IS NULL%'
      and with_check like '%user_id IS NOT NULL%'
  ) then
    raise exception 'admin binding policy must only allow null-to-bound transitions';
  end if;

  if not exists (
    select 1 from public.admin_users where email = 'eslam@adscope.net'
  ) then
    raise exception 'primary admin email must be pre-authorized';
  end if;
end
$$;

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'eslam@adscope.net'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.com');

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
  begin
    update public.admin_users
    set user_id = '22222222-2222-4222-8222-222222222222'
    where email = 'eslam@adscope.net';
    raise exception using errcode = 'ZX001', message = 'service_role rebinding unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'admin authorization binding is immutable' then
        raise;
      end if;
  end;
end
$$;

do $$
begin
  begin
    update public.admin_users
    set email = 'changed@example.com'
    where email = 'eslam@adscope.net';
    raise exception using errcode = 'ZX002', message = 'service_role email change unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

do $$
begin
  begin
    update public.admin_users
    set user_id = '22222222-2222-4222-8222-222222222222'
    where email = 'eslam@adscope.net';
    raise exception using errcode = 'ZX003', message = 'privileged rebinding unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'admin authorization binding is immutable' then
        raise;
      end if;
  end;
end
$$;

do $$
begin
  begin
    update public.admin_users
    set email = 'changed@example.com'
    where email = 'eslam@adscope.net';
    raise exception using errcode = 'ZX004', message = 'privileged email change unexpectedly succeeded';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'admin authorization email is immutable' then
        raise;
      end if;
  end;
end
$$;

do $$
begin
  if not exists (
    select 1
    from public.admin_users
    where email = 'eslam@adscope.net'
      and user_id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'primary admin binding changed after immutability checks';
  end if;
end
$$;

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
