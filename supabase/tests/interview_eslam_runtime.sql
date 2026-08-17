begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','interview-admin@example.com',now(),now()),
  ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','interview-other@example.com',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$
begin
  begin perform 1 from public.interview_sessions; raise exception 'authenticated role unexpectedly read interview sessions'; exception when insufficient_privilege then null; end;
  begin perform public.start_interview_session('11111111-1111-4111-8111-111111111111'); raise exception 'authenticated role unexpectedly started interview session'; exception when insufficient_privilege then null; end;
end; $$;
reset role;

set local role anon;
do $$
begin
  begin perform 1 from public.interview_answers; raise exception 'anon role unexpectedly read interview answers'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role service_role;

create temporary table interview_ids (session_id uuid, question_id uuid, answer_id uuid, source_id uuid, claim_token uuid);
do $$
declare v_session_id uuid; v_repeat_id uuid;
begin
  select public.start_interview_session('11111111-1111-4111-8111-111111111111') into v_session_id;
  select public.start_interview_session('11111111-1111-4111-8111-111111111111') into v_repeat_id;
  if v_session_id is null or v_session_id <> v_repeat_id then raise exception 'active interview session was not idempotent'; end if;
  insert into interview_ids (session_id) values (v_session_id);
end; $$;

do $$
declare v_session_id uuid; v_question_id uuid; v_repeat_id uuid;
begin
  select session_id into v_session_id from interview_ids;
  select public.record_interview_question(v_session_id,'11111111-1111-4111-8111-111111111111',jsonb_build_object(
    'question','Your approved teaching says paid traffic should diagnose a known system. What specifically makes an offer validated enough for you to run cold ads?',
    'topic','Offer validation before paid acquisition','topic_key','offer validation before paid acquisition',
    'why_this_question','The existing teaching describes acquisition tactics but does not define the readiness threshold.',
    'gap_type','missing_decision_rule',
    'grounding_sources',jsonb_build_array(jsonb_build_object('source_id','brain:test:v1','source_type','brain','source_label','Approved Brain test','exact_excerpt','paid traffic')),
    'relevant_known_facts',jsonb_build_array(jsonb_build_object('source_id','brain:test:v1','fact','Existing material discusses paid acquisition.')),
    'follow_up_recommended',true,'question_fingerprint',repeat('a',64),'model','gpt-5-mini','prompt_version',1
  )) into v_question_id;
  select public.record_interview_question(v_session_id,'11111111-1111-4111-8111-111111111111',jsonb_build_object(
    'question','This payload should never replace the already open question.','topic','Other','topic_key','other','why_this_question','Race test.',
    'gap_type','other_grounded_gap','grounding_sources',jsonb_build_array(jsonb_build_object('source_id','brain:test:v1','source_type','brain','source_label','Approved Brain test','exact_excerpt','paid traffic')),
    'relevant_known_facts','[]'::jsonb,'follow_up_recommended',false,'question_fingerprint',repeat('b',64),'model','gpt-5-mini','prompt_version',1
  )) into v_repeat_id;
  if v_question_id is null or v_repeat_id <> v_question_id then raise exception 'one-open-question invariant failed'; end if;
  update interview_ids set question_id = v_question_id;
end; $$;

do $$
declare v_question_id uuid;
begin
  select question_id into v_question_id from interview_ids;
  begin
    perform public.submit_interview_answer(v_question_id,'22222222-2222-4222-8222-222222222222','Cross-owner answer must fail.');
    raise exception 'cross-owner answer unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'cross-owner answer unexpectedly succeeded' then raise; end if;
    if position('interview question not found' in sqlerrm) = 0 then raise exception 'cross-owner answer returned unexpected error: %', sqlerrm; end if;
  end;
end; $$;

do $$
declare v_question_id uuid; v_answer_id uuid; v_source_id uuid; v_session_id uuid;
begin
  select question_id into v_question_id from interview_ids;
  select answer_id, source_id, session_id into v_answer_id, v_source_id, v_session_id
  from public.submit_interview_answer(v_question_id,'11111111-1111-4111-8111-111111111111','I require three manual sales before cold ads. Otherwise I am testing the offer, message, traffic, and sales process at the same time.');
  if v_answer_id is null or v_source_id is null or v_session_id is null then raise exception 'interview answer did not persist'; end if;
  if not exists (select 1 from public.interview_questions where id=v_question_id and status='answered') then raise exception 'answered question did not transition to answered'; end if;
  if not exists (select 1 from public.teaching_sources where id=v_source_id and source_type='interview' and source_metadata->>'question_id'=v_question_id::text) then raise exception 'interview answer did not create durable teaching source provenance'; end if;
  if exists (select 1 from public.eslam_brain_items where created_by='11111111-1111-4111-8111-111111111111') then raise exception 'raw interview answer unexpectedly created Brain content before extraction'; end if;
  update interview_ids set answer_id=v_answer_id, source_id=v_source_id;
end; $$;

create temporary table wrong_owner_claim as select * from public.claim_interview_answer_extraction((select answer_id from interview_ids),'22222222-2222-4222-8222-222222222222','gpt-5-mini',1,150);
do $$ begin if not exists (select 1 from wrong_owner_claim where claim_state='not_found' and answer_id is null) then raise exception 'cross-owner extraction claim did not fail closed'; end if; end; $$;
create temporary table first_claim as select * from public.claim_interview_answer_extraction((select answer_id from interview_ids),'11111111-1111-4111-8111-111111111111','gpt-5-mini',1,150);
do $$ declare v_token uuid; begin select claim_token into v_token from first_claim where claim_state='claimed'; if v_token is null then raise exception 'interview answer extraction was not claimed'; end if; update interview_ids set claim_token=v_token; end; $$;
create temporary table busy_claim as select * from public.claim_interview_answer_extraction((select answer_id from interview_ids),'11111111-1111-4111-8111-111111111111','gpt-5-mini',1,150);
do $$ begin if not exists (select 1 from busy_claim where claim_state='busy' and attempt_count=1) then raise exception 'active interview extraction lease did not prevent duplicate claim'; end if; end; $$;

do $$
declare v_answer_id uuid; v_claim_token uuid;
begin
  select answer_id,claim_token into v_answer_id,v_claim_token from interview_ids;
  begin
    perform * from public.complete_interview_answer_extraction(v_answer_id,'11111111-1111-4111-8111-111111111111',v_claim_token,jsonb_build_array(jsonb_build_object(
      'semantic_layer','brain','item_type','diagnostic_rule','priority',50,'title','Manual-sales threshold before cold ads',
      'content','Require evidence of manual sales before using cold paid acquisition to scale a coaching offer.',
      'summary','Validate the offer manually before cold paid acquisition.','topics',jsonb_build_array('offer validation','paid acquisition'),'source_excerpt','This excerpt is not in the answer.'
    )));
    raise exception 'ungrounded interview teaching candidate unexpectedly completed';
  exception when others then
    if sqlerrm='ungrounded interview teaching candidate unexpectedly completed' then raise; end if;
    if position('not grounded in answer' in sqlerrm)=0 then raise exception 'ungrounded candidate returned unexpected error: %',sqlerrm; end if;
  end;
end; $$;

create temporary table completed_drafts as
select * from public.complete_interview_answer_extraction(
  (select answer_id from interview_ids),'11111111-1111-4111-8111-111111111111',(select claim_token from interview_ids),
  jsonb_build_array(
    jsonb_build_object('semantic_layer','brain','item_type','diagnostic_rule','priority',50,'title','Manual-sales threshold before cold ads','content','Require evidence of manual sales before using cold paid acquisition to scale a coaching offer.','summary','Validate the offer manually before cold paid acquisition.','topics',jsonb_build_array('offer validation','paid acquisition'),'source_excerpt','I require three manual sales before cold ads.'),
    jsonb_build_object('semantic_layer','brain','item_type','principle','priority',60,'title','Avoid simultaneous validation of the whole acquisition system','content','Do not use cold traffic to test the offer, message, traffic, and sales process simultaneously because diagnosis becomes ambiguous.','summary',null,'topics',jsonb_build_array('diagnosis','offer validation'),'source_excerpt','Otherwise I am testing the offer, message, traffic, and sales process at the same time.')
  )
);

do $$
declare v_answer_id uuid;
begin
  select answer_id into v_answer_id from interview_ids;
  if (select count(*) from completed_drafts)<>2 then raise exception 'interview extraction did not create both teaching drafts'; end if;
  if (select count(*) from public.eslam_brain_items where created_by='11111111-1111-4111-8111-111111111111' and status='draft')<>2 then raise exception 'interview candidates did not materialize as Brain drafts'; end if;
  if exists (select 1 from public.eslam_brain_items where created_by='11111111-1111-4111-8111-111111111111' and status<>'draft') then raise exception 'interview candidate bypassed normal Brain review lifecycle'; end if;
  if not exists (
    select 1 from public.teaching_versions tv join public.interview_answer_teachings m on m.brain_item_id=tv.brain_item_id
    where m.answer_id=v_answer_id and tv.source_locator->>'kind'='interview_answer' and tv.source_locator->>'source_excerpt'='I require three manual sales before cold ads.'
  ) then raise exception 'interview Brain draft lost exact answer provenance'; end if;
  if not exists (select 1 from public.interview_answers where id=v_answer_id and extraction_status='completed' and extraction_claim_token is null and extraction_completed_at is not null) then raise exception 'completed interview extraction state was not finalized'; end if;
end; $$;

create temporary table completed_claim as select * from public.claim_interview_answer_extraction((select answer_id from interview_ids),'11111111-1111-4111-8111-111111111111','gpt-5-mini',1,150);
do $$ begin if not exists (select 1 from completed_claim where claim_state='completed' and attempt_count=1) then raise exception 'completed interview extraction was not idempotently recognized'; end if; end; $$;

do $$
declare v_session_id uuid; v_question_id uuid; v_resolved_session uuid;
begin
  select session_id into v_session_id from interview_ids;
  select public.record_interview_question(v_session_id,'11111111-1111-4111-8111-111111111111',jsonb_build_object(
    'question','A second grounded topic that Eslam says is not relevant?','topic','Irrelevant legacy topic','topic_key','irrelevant legacy topic','why_this_question','Grounded suppression test.',
    'gap_type','missing_eslam_opinion','grounding_sources',jsonb_build_array(jsonb_build_object('source_id','brain:test:v2','source_type','brain','source_label','Approved Brain test','exact_excerpt','legacy topic')),
    'relevant_known_facts','[]'::jsonb,'follow_up_recommended',false,'question_fingerprint',repeat('c',64),'model','gpt-5-mini','prompt_version',1
  )) into v_question_id;
  select public.resolve_interview_question(v_question_id,'11111111-1111-4111-8111-111111111111','not_relevant',true) into v_resolved_session;
  if v_resolved_session<>v_session_id then raise exception 'not-relevant resolution returned wrong session'; end if;
  if not exists (select 1 from public.interview_topic_suppressions where created_by='11111111-1111-4111-8111-111111111111' and topic_key='irrelevant legacy topic') then raise exception 'explicit interview topic suppression was not persisted'; end if;
end; $$;

do $$
declare v_question_id uuid; v_answer_id uuid;
begin
  select question_id,answer_id into v_question_id,v_answer_id from interview_ids;
  begin update public.interview_questions set question='Mutated question' where id=v_question_id; raise exception 'interview question content unexpectedly mutated';
  exception when others then if sqlerrm='interview question content unexpectedly mutated' then raise; end if; if position('interview question content is immutable' in sqlerrm)=0 then raise exception 'question immutability returned unexpected error: %',sqlerrm; end if; end;
  begin update public.interview_answers set answer_text='Mutated answer' where id=v_answer_id; raise exception 'interview answer content unexpectedly mutated';
  exception when others then if sqlerrm='interview answer content unexpectedly mutated' then raise; end if; if position('interview answer content is immutable' in sqlerrm)=0 then raise exception 'answer immutability returned unexpected error: %',sqlerrm; end if; end;
end; $$;

rollback;
