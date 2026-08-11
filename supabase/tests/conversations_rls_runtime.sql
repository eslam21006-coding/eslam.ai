begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'conversation-a@example.test', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'conversation-b@example.test', now(), now());

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.claim_conversation_generation(uuid,uuid,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated clients can claim generation leases';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.release_conversation_generation(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated clients can release generation leases';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);

do $$
declare
  conversation_a uuid;
  conversation_b uuid;
  visible_count integer;
  affected_count integer;
  forged_owner_blocked boolean := false;
  forged_link_blocked boolean := false;
  assistant_role_blocked boolean := false;
begin
  conversation_a := public.create_conversation_with_first_message('Tenant A first message');

  if not exists (
    select 1
    from public.messages
    where conversation_id = conversation_a
      and user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and role = 'user'
      and content = 'Tenant A first message'
  ) then
    raise exception 'Atomic conversation creation did not persist the first message';
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
    true
  );

  select count(*) into visible_count
  from public.conversations
  where id = conversation_a;

  if visible_count <> 0 then
    raise exception 'RLS leak: user B can read user A conversation';
  end if;

  select count(*) into visible_count
  from public.messages
  where conversation_id = conversation_a;

  if visible_count <> 0 then
    raise exception 'RLS leak: user B can read user A messages';
  end if;

  update public.conversations
  set title = 'Tenant B overwrite'
  where id = conversation_a;
  get diagnostics affected_count = row_count;

  if affected_count <> 0 then
    raise exception 'RLS leak: user B updated user A conversation';
  end if;

  delete from public.conversations
  where id = conversation_a;
  get diagnostics affected_count = row_count;

  if affected_count <> 0 then
    raise exception 'RLS leak: user B deleted user A conversation';
  end if;

  begin
    insert into public.messages (conversation_id, user_id, role, content)
    values (
      conversation_a,
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'user',
      'Forged owner append'
    );
  exception
    when insufficient_privilege then
      forged_owner_blocked := true;
  end;

  if not forged_owner_blocked then
    raise exception 'RLS leak: user B appended with user A identity';
  end if;

  begin
    insert into public.messages (conversation_id, user_id, role, content)
    values (
      conversation_a,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'user',
      'Forged conversation link'
    );
  exception
    when foreign_key_violation then
      forged_link_blocked := true;
  end;

  if not forged_link_blocked then
    raise exception 'Ownership FK leak: user B attached a message to user A conversation';
  end if;

  conversation_b := public.create_conversation_with_first_message('Tenant B first message');

  insert into public.messages (conversation_id, user_id, role, content)
  values (
    conversation_b,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'user',
    'Tenant B follow-up'
  );

  if not exists (
    select 1
    from public.messages
    where conversation_id = conversation_b
      and user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and role = 'user'
      and content = 'Tenant B follow-up'
  ) then
    raise exception 'Own follow-up insert failed after activity hardening';
  end if;

  begin
    insert into public.messages (conversation_id, user_id, role, content)
    values (
      conversation_b,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'assistant',
      'Forged assistant message'
    );
  exception
    when insufficient_privilege then
      assistant_role_blocked := true;
  end;

  if not assistant_role_blocked then
    raise exception 'Authenticated client forged an assistant message';
  end if;
end;
$$;

reset role;
set local role service_role;

insert into public.conversations (id, user_id, title)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Generation lease test'
);

do $$
declare
  claimed boolean;
  released boolean;
begin
  claimed := public.claim_conversation_generation(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    180
  );
  if not claimed then
    raise exception 'First generation lease was not claimed';
  end if;

  claimed := public.claim_conversation_generation(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '22222222-2222-4222-8222-222222222222',
    180
  );
  if claimed then
    raise exception 'Concurrent generation lease was incorrectly claimed';
  end if;

  released := public.release_conversation_generation(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '22222222-2222-4222-8222-222222222222'
  );
  if released then
    raise exception 'Generation lease released with the wrong token';
  end if;

  released := public.release_conversation_generation(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111'
  );
  if not released then
    raise exception 'Generation lease did not release with the owner token';
  end if;

  claimed := public.claim_conversation_generation(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '22222222-2222-4222-8222-222222222222',
    180
  );
  if not claimed then
    raise exception 'Generation lease could not be reclaimed after release';
  end if;
end;
$$;

reset role;
rollback;

select 'conversation_rls_runtime_ok' as result;
