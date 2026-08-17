begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('33333333-3333-4333-8333-333333333333','authenticated','authenticated','interview-intelligence-admin@example.com',now(),now()),
  ('44444444-4444-4444-8444-444444444444','authenticated','authenticated','interview-intelligence-other@example.com',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$
begin
  begin perform public.set_interview_session_focus('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333','Sales','sales'); raise exception 'authenticated role unexpectedly changed interview focus'; exception when insufficient_privilege then null; end;
  begin perform public.complete_interview_session('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333'); raise exception 'authenticated role unexpectedly completed interview session'; exception when insufficient_privilege then null; end;
  begin perform public.get_interview_intelligence_stats('33333333-3333-4333-8333-333333333333'); raise exception 'authenticated role unexpectedly read interview stats'; exception when insufficient_privilege then null; end;
end; $$;
reset role;

set local role anon;
do $$
begin
  begin perform public.get_interview_intelligence_stats('33333333-3333-4333-8333-333333333333'); raise exception 'anon role unexpectedly read interview stats'; exception when insufficient_privilege then null; end;
end; $$;
reset role;

set local role service_role;
create temporary table intelligence_ids (session_id uuid, question_id uuid);

do $$
declare v_session_id uuid; v_changed boolean;
begin
  select public.start_interview_session('33333333-3333-4333-8333-333333333333') into v_session_id;
  if v_session_id is null then raise exception 'intelligence test session was not created'; end if;
  select public.set_interview_session_focus(v_session_id,'33333333-3333-4333-8333-333333333333','Offer validation','offer validation') into v_changed;
  if v_changed is distinct from true then raise exception 'owner could not set interview focus'; end if;
  if not exists (
    select 1 from public.interview_sessions
    where id=v_session_id and focus_topic='Offer validation' and focus_topic_key='offer validation' and status='active' and completed_at is null
  ) then raise exception 'interview focus did not persist on active session'; end if;
  insert into intelligence_ids(session_id) values(v_session_id);
end; $$;

do $$
declare v_session_id uuid; v_changed boolean; v_completed boolean;
begin
  select session_id into v_session_id from intelligence_ids;
  select public.set_interview_session_focus(v_session_id,'44444444-4444-4444-8444-444444444444','Hacked','hacked') into v_changed;
  if v_changed is distinct from false then raise exception 'cross-owner focus update did not fail closed'; end if;
  select public.complete_interview_session(v_session_id,'44444444-4444-4444-8444-444444444444') into v_completed;
  if v_completed is distinct from false then raise exception 'cross-owner session completion did not fail closed'; end if;
end; $$;

do $$
declare v_session_id uuid; v_question_id uuid;
begin
  select session_id into v_session_id from intelligence_ids;
  select public.record_interview_question(v_session_id,'33333333-3333-4333-8333-333333333333',jsonb_build_object(
    'question','What exact evidence makes your offer validated enough to scale?',
    'topic','Offer validation','topic_key','offer validation',
    'why_this_question','The current material gives a principle but no operational threshold.',
    'gap_type','missing_decision_rule',
    'grounding_sources',jsonb_build_array(jsonb_build_object('source_id','brain:intelligence:v1','source_type','brain','source_label','Approved Brain test','exact_excerpt','validated offer')),
    'relevant_known_facts','[]'::jsonb,'follow_up_recommended',true,'question_fingerprint',repeat('d',64),'model','gpt-5-mini','prompt_version',2
  )) into v_question_id;
  if v_question_id is null then raise exception 'intelligence test question was not created'; end if;
  update intelligence_ids set question_id=v_question_id;
end; $$;

do $$
declare v_stats jsonb;
begin
  select public.get_interview_intelligence_stats('33333333-3333-4333-8333-333333333333') into v_stats;
  if (v_stats->>'session_count')::integer <> 1 then raise exception 'stats session count was incorrect'; end if;
  if (v_stats->>'answered_count')::integer <> 0 then raise exception 'stats answered count was incorrect'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_stats->'gap_status_counts') entry
    where entry->>'gap_type'='missing_decision_rule' and entry->>'status'='asked' and (entry->>'count')::integer=1
  ) then raise exception 'stats did not include open decision-rule coverage'; end if;
end; $$;

do $$
declare v_session_id uuid; v_completed boolean; v_new_session_id uuid;
begin
  select session_id into v_session_id from intelligence_ids;
  select public.complete_interview_session(v_session_id,'33333333-3333-4333-8333-333333333333') into v_completed;
  if v_completed is distinct from true then raise exception 'owner could not complete interview session'; end if;
  if not exists (
    select 1 from public.interview_sessions where id=v_session_id and status='completed' and completed_at is not null
  ) then raise exception 'completed interview session did not persist completion timestamp'; end if;
  if not exists (
    select 1 from public.interview_questions where id=(select question_id from intelligence_ids) and status='skipped' and resolved_at is not null
  ) then raise exception 'open question was not preserved as skipped when session completed'; end if;
  select public.start_interview_session('33333333-3333-4333-8333-333333333333') into v_new_session_id;
  if v_new_session_id is null or v_new_session_id=v_session_id then raise exception 'new session was not created after completion'; end if;
  if not exists (select 1 from public.interview_sessions where id=v_new_session_id and status='active' and completed_at is null) then raise exception 'replacement session is not active'; end if;
  if public.set_interview_session_focus(v_new_session_id,'33333333-3333-4333-8333-333333333333',null,null) is distinct from true then raise exception 'focus clear failed'; end if;
end; $$;

do $$
declare v_stats jsonb;
begin
  select public.get_interview_intelligence_stats('33333333-3333-4333-8333-333333333333') into v_stats;
  if (v_stats->>'session_count')::integer <> 2 then raise exception 'stats did not include both interview sessions'; end if;
  if (v_stats->>'completed_session_count')::integer <> 1 then raise exception 'stats completed-session count was incorrect'; end if;
  if (v_stats->>'skipped_count')::integer <> 1 then raise exception 'session completion did not flow into skipped analytics'; end if;
end; $$;

rollback;
