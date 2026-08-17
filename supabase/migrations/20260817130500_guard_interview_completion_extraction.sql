-- Task 25 follow-up: do not complete a session while one of its saved answers still needs extraction.
-- This preserves the existing retry control because the session remains active until extraction succeeds.

create or replace function public.complete_interview_session(
  p_session_id uuid,
  p_created_by uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  select s.id into v_session_id
  from public.interview_sessions s
  where s.id = p_session_id
    and s.created_by = p_created_by
    and s.status = 'active'
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.interview_answers a
    where a.session_id = v_session_id
      and a.created_by = p_created_by
      and a.extraction_status in ('pending', 'processing', 'failed')
  ) then
    return false;
  end if;

  update public.interview_questions
  set status = 'skipped',
      resolved_at = timezone('utc', now())
  where session_id = v_session_id
    and created_by = p_created_by
    and status = 'asked';

  update public.interview_sessions
  set status = 'completed',
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_session_id;

  return true;
end;
$$;

revoke all on function public.complete_interview_session(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.complete_interview_session(uuid, uuid)
  to service_role;
