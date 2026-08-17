-- Task 25 — Interview Intelligence.
-- Forward-only: session focus/completion plus exact aggregate progress for the existing Interview Eslam lifecycle.

alter table public.interview_sessions
  add column focus_topic text
    check (focus_topic is null or char_length(btrim(focus_topic)) between 1 and 120),
  add column focus_topic_key text
    check (focus_topic_key is null or char_length(btrim(focus_topic_key)) between 1 and 160),
  add column completed_at timestamptz;

alter table public.interview_sessions
  add constraint interview_sessions_focus_pair_check
  check ((focus_topic is null) = (focus_topic_key is null)) not valid;

alter table public.interview_sessions
  validate constraint interview_sessions_focus_pair_check;

alter table public.interview_sessions
  add constraint interview_sessions_completion_state_check
  check (
    (status = 'active' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  ) not valid;

alter table public.interview_sessions
  validate constraint interview_sessions_completion_state_check;

create index interview_sessions_creator_history_idx
  on public.interview_sessions (created_by, created_at desc, id desc);

create or replace function public.set_interview_session_focus(
  p_session_id uuid,
  p_created_by uuid,
  p_focus_topic text,
  p_focus_topic_key text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_focus_topic text := nullif(btrim(coalesce(p_focus_topic, '')), '');
  v_focus_topic_key text := nullif(btrim(coalesce(p_focus_topic_key, '')), '');
begin
  if (v_focus_topic is null) <> (v_focus_topic_key is null) then
    raise exception 'invalid interview focus';
  end if;
  if v_focus_topic is not null and char_length(v_focus_topic) > 120 then
    raise exception 'invalid interview focus';
  end if;
  if v_focus_topic_key is not null and char_length(v_focus_topic_key) > 160 then
    raise exception 'invalid interview focus';
  end if;

  update public.interview_sessions
  set focus_topic = v_focus_topic,
      focus_topic_key = v_focus_topic_key,
      updated_at = timezone('utc', now())
  where id = p_session_id
    and created_by = p_created_by
    and status = 'active';

  return found;
end;
$$;

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

create or replace function public.get_interview_intelligence_stats(p_created_by uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'answered_count', (
      select count(*) from public.interview_questions q
      where q.created_by = p_created_by and q.status = 'answered'
    ),
    'skipped_count', (
      select count(*) from public.interview_questions q
      where q.created_by = p_created_by and q.status = 'skipped'
    ),
    'not_relevant_count', (
      select count(*) from public.interview_questions q
      where q.created_by = p_created_by and q.status = 'not_relevant'
    ),
    'distinct_answered_topics', (
      select count(distinct q.topic_key) from public.interview_questions q
      where q.created_by = p_created_by and q.status = 'answered'
    ),
    'session_count', (
      select count(*) from public.interview_sessions s
      where s.created_by = p_created_by
    ),
    'completed_session_count', (
      select count(*) from public.interview_sessions s
      where s.created_by = p_created_by and s.status = 'completed'
    ),
    'gap_status_counts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'gap_type', grouped.gap_type,
          'status', grouped.status,
          'count', grouped.row_count
        )
        order by grouped.gap_type, grouped.status
      )
      from (
        select q.gap_type, q.status, count(*)::integer as row_count
        from public.interview_questions q
        where q.created_by = p_created_by
        group by q.gap_type, q.status
      ) grouped
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.set_interview_session_focus(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_interview_session(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_interview_intelligence_stats(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.set_interview_session_focus(uuid, uuid, text, text)
  to service_role;
grant execute on function public.complete_interview_session(uuid, uuid)
  to service_role;
grant execute on function public.get_interview_intelligence_stats(uuid)
  to service_role;
