begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'rls-a@example.test', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'rls-b@example.test', now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

insert into public.business_dna (user_id, business_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Tenant A');

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);

do $$
declare
  visible_count integer;
  updated_count integer;
  insert_blocked boolean := false;
begin
  select count(*) into visible_count
  from public.business_dna
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  if visible_count <> 0 then
    raise exception 'RLS leak: user B can read user A Business DNA';
  end if;

  update public.business_dna
  set business_name = 'Tenant B overwrite'
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  get diagnostics updated_count = row_count;

  if updated_count <> 0 then
    raise exception 'RLS leak: user B updated user A Business DNA';
  end if;

  begin
    insert into public.business_dna (user_id, business_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Cross tenant insert');
  exception
    when insufficient_privilege then
      insert_blocked := true;
  end;

  if not insert_blocked then
    raise exception 'RLS leak: cross-tenant insert was not rejected';
  end if;
end;
$$;

reset role;
rollback;

select 'business_dna_rls_runtime_ok' as result;
