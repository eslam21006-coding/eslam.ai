alter table public.conversations
  add column generation_lock_token uuid,
  add column generation_lock_expires_at timestamptz;

alter table public.conversations
  add constraint conversations_generation_lock_pair
  check (
    (generation_lock_token is null and generation_lock_expires_at is null)
    or
    (generation_lock_token is not null and generation_lock_expires_at is not null)
  );

create or replace function public.claim_conversation_generation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_token uuid,
  p_lock_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_count integer;
begin
  if p_lock_seconds is null or p_lock_seconds < 1 or p_lock_seconds > 300 then
    raise exception 'Invalid generation lock duration';
  end if;

  update public.conversations
  set
    generation_lock_token = p_token,
    generation_lock_expires_at = now() + make_interval(secs => p_lock_seconds)
  where id = p_conversation_id
    and user_id = p_user_id
    and (
      generation_lock_token is null
      or generation_lock_expires_at <= now()
    );

  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$$;

create or replace function public.release_conversation_generation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_count integer;
begin
  update public.conversations
  set
    generation_lock_token = null,
    generation_lock_expires_at = null
  where id = p_conversation_id
    and user_id = p_user_id
    and generation_lock_token = p_token;

  get diagnostics affected_count = row_count;
  return affected_count = 1;
end;
$$;

revoke all on function public.claim_conversation_generation(uuid, uuid, uuid, integer) from public;
revoke all on function public.claim_conversation_generation(uuid, uuid, uuid, integer) from anon, authenticated;
grant execute on function public.claim_conversation_generation(uuid, uuid, uuid, integer) to service_role;

revoke all on function public.release_conversation_generation(uuid, uuid, uuid) from public;
revoke all on function public.release_conversation_generation(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.release_conversation_generation(uuid, uuid, uuid) to service_role;
