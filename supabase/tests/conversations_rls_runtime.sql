begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'conversation-a@example.test', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'conversation-b@example.test', now(), now());

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
rollback;

select 'conversation_rls_runtime_ok' as result;
