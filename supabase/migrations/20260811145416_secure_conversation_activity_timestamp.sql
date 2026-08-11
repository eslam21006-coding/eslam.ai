create or replace function public.touch_conversation_after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id
    and user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.touch_conversation_after_message_insert() from public, anon, authenticated;
revoke update (updated_at) on table public.conversations from authenticated;
