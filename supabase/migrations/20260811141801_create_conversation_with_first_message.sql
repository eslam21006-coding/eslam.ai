create function public.create_conversation_with_first_message(p_content text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_content text := btrim(p_content);
  v_conversation_id uuid;
  v_title text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_content is null or char_length(v_content) < 1 or char_length(v_content) > 20000 then
    raise exception 'invalid message content' using errcode = '22023';
  end if;

  v_title := left(regexp_replace(v_content, '\s+', ' ', 'g'), 80);

  insert into public.conversations (user_id, title)
  values (v_user_id, v_title)
  returning id into v_conversation_id;

  insert into public.messages (conversation_id, user_id, role, content)
  values (v_conversation_id, v_user_id, 'user', v_content);

  return v_conversation_id;
end;
$$;

revoke all on function public.create_conversation_with_first_message(text) from public, anon;
grant execute on function public.create_conversation_with_first_message(text) to authenticated;
