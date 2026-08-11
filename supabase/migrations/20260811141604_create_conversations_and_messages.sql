create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'محادثة جديدة',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_title_length check (char_length(title) between 1 and 160),
  constraint conversations_id_user_id_key unique (id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_role_check check (role in ('user', 'assistant', 'system')),
  constraint messages_content_length check (char_length(content) between 1 and 20000),
  constraint messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.conversations(id, user_id)
    on delete cascade
);

create index conversations_user_activity_idx
  on public.conversations(user_id, updated_at desc, id desc);

create index messages_conversation_order_idx
  on public.messages(conversation_id, created_at asc, id asc);

create function public.set_conversations_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_conversations_updated_at() from public, anon, authenticated;

create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_conversations_updated_at();

create function public.touch_conversation_after_message_insert()
returns trigger
language plpgsql
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

create trigger touch_conversation_after_message_insert
after insert on public.messages
for each row
execute function public.touch_conversation_after_message_insert();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert on table public.messages to authenticated;

create policy "Users can read their own conversations"
  on public.conversations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own conversations"
  on public.conversations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own conversations"
  on public.conversations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own conversations"
  on public.conversations
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own messages"
  on public.messages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can append their own user messages"
  on public.messages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and role = 'user');
