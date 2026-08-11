revoke all on table public.conversations from authenticated;
revoke all on table public.messages from authenticated;

grant select on table public.conversations to authenticated;
grant insert (user_id, title) on table public.conversations to authenticated;
grant update (title, updated_at) on table public.conversations to authenticated;
grant delete on table public.conversations to authenticated;

grant select on table public.messages to authenticated;
grant insert (conversation_id, user_id, role, content) on table public.messages to authenticated;
