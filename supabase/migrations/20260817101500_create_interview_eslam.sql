-- Task 24 — Interview Eslam MVP.
-- Forward-only: adds durable interview state and reuses the existing Teaching -> Brain lineage.

alter table public.teaching_sources
  drop constraint teaching_sources_source_type_check;

alter table public.teaching_sources
  add constraint teaching_sources_source_type_check
  check (source_type in ('manual_text', 'voice', 'document', 'legacy', 'interview'));

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active'
    check (status in ('active', 'completed')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index interview_sessions_one_active_per_admin_idx
  on public.interview_sessions (created_by)
  where status = 'active';

create table public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete restrict,
  created_by uuid not null,
  ordinal integer not null check (ordinal > 0),
  status text not null default 'asked'
    check (status in ('asked', 'answered', 'skipped', 'not_relevant')),
  question text not null
    check (char_length(btrim(question)) between 1 and 2000),
  topic text not null
    check (char_length(btrim(topic)) between 1 and 120),
  topic_key text not null
    check (char_length(btrim(topic_key)) between 1 and 160),
  why_this_question text not null
    check (char_length(btrim(why_this_question)) between 1 and 2000),
  gap_type text not null
    check (gap_type in (
      'missing_belief',
      'missing_decision_rule',
      'missing_exception',
      'missing_example',
      'missing_case_study',
      'ambiguous_framework',
      'unclear_process',
      'incomplete_audience_understanding',
      'incomplete_offer_strategy',
      'incomplete_acquisition_philosophy',
      'incomplete_funnel_philosophy',
      'incomplete_sales_philosophy',
      'missing_objection_principle',
      'missing_client_selection_rule',
      'missing_failure_lesson',
      'missing_contrarian_opinion',
      'contradiction',
      'missing_eslam_opinion',
      'other_grounded_gap'
    )),
  grounding_sources jsonb not null
    check (
      jsonb_typeof(grounding_sources) = 'array'
      and jsonb_array_length(grounding_sources) between 1 and 4
    ),
  relevant_known_facts jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(relevant_known_facts) = 'array'
      and jsonb_array_length(relevant_known_facts) <= 6
    ),
  follow_up_recommended boolean not null default false,
  question_fingerprint text not null
    check (question_fingerprint ~ '^[0-9a-f]{64}$'),
  model text not null
    check (char_length(btrim(model)) between 1 and 200),
  prompt_version integer not null default 1 check (prompt_version > 0),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint interview_questions_session_ordinal_unique unique (session_id, ordinal),
  constraint interview_questions_creator_fingerprint_unique unique (created_by, question_fingerprint)
);

create unique index interview_questions_one_open_per_session_idx
  on public.interview_questions (session_id)
  where status = 'asked';

create index interview_questions_creator_history_idx
  on public.interview_questions (created_by, created_at desc, id desc);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete restrict,
  question_id uuid not null unique references public.interview_questions(id) on delete restrict,
  source_id uuid not null unique references public.teaching_sources(id) on delete restrict,
  created_by uuid not null,
  answer_text text not null
    check (char_length(btrim(answer_text)) between 1 and 16000),
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  extraction_attempt_count integer not null default 0 check (extraction_attempt_count >= 0),
  extraction_claim_token uuid,
  extraction_lease_expires_at timestamptz,
  extraction_model text
    check (extraction_model is null or char_length(btrim(extraction_model)) between 1 and 200),
  extraction_prompt_version integer
    check (extraction_prompt_version is null or extraction_prompt_version > 0),
  extraction_last_error_code text
    check (extraction_last_error_code is null or char_length(btrim(extraction_last_error_code)) between 1 and 120),
  extraction_last_error_at timestamptz,
  extraction_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interview_answers_creator_history_idx
  on public.interview_answers (created_by, created_at desc, id desc);

create index interview_answers_session_id_idx
  on public.interview_answers (session_id);

create index interview_answers_retry_idx
  on public.interview_answers (created_by, extraction_status, updated_at desc)
  where extraction_status in ('pending', 'failed');

create table public.interview_answer_teachings (
  answer_id uuid not null references public.interview_answers(id) on delete restrict,
  candidate_ordinal integer not null check (candidate_ordinal > 0),
  brain_item_id uuid not null unique references public.eslam_brain_items(id) on delete restrict,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (answer_id, candidate_ordinal)
);

create table public.interview_topic_suppressions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  session_id uuid not null references public.interview_sessions(id) on delete restrict,
  topic_key text not null
    check (char_length(btrim(topic_key)) between 1 and 160),
  topic_label text not null
    check (char_length(btrim(topic_label)) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint interview_topic_suppressions_creator_topic_unique unique (created_by, topic_key)
);

create index interview_topic_suppressions_creator_idx
  on public.interview_topic_suppressions (created_by, created_at desc);

create index interview_topic_suppressions_session_id_idx
  on public.interview_topic_suppressions (session_id);

create or replace function public.prevent_interview_question_content_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.session_id <> old.session_id
    or new.created_by <> old.created_by
    or new.ordinal <> old.ordinal
    or new.question <> old.question
    or new.topic <> old.topic
    or new.topic_key <> old.topic_key
    or new.why_this_question <> old.why_this_question
    or new.gap_type <> old.gap_type
    or new.grounding_sources <> old.grounding_sources
    or new.relevant_known_facts <> old.relevant_known_facts
    or new.follow_up_recommended <> old.follow_up_recommended
    or new.question_fingerprint <> old.question_fingerprint
    or new.model <> old.model
    or new.prompt_version <> old.prompt_version
    or new.created_at <> old.created_at then
    raise exception 'interview question content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger prevent_interview_question_content_update
before update on public.interview_questions
for each row
execute function public.prevent_interview_question_content_mutation();

create or replace function public.prevent_interview_answer_content_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.session_id <> old.session_id
    or new.question_id <> old.question_id
    or new.source_id <> old.source_id
    or new.created_by <> old.created_by
    or new.answer_text <> old.answer_text
    or new.created_at <> old.created_at then
    raise exception 'interview answer content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger prevent_interview_answer_content_update
before update on public.interview_answers
for each row
execute function public.prevent_interview_answer_content_mutation();

create trigger prevent_interview_session_delete
before delete on public.interview_sessions
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_interview_question_delete
before delete on public.interview_questions
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_interview_answer_delete
before delete on public.interview_answers
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_interview_answer_teaching_update
before update on public.interview_answer_teachings
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_interview_answer_teaching_delete
before delete on public.interview_answer_teachings
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_interview_topic_suppression_update
before update on public.interview_topic_suppressions
for each row
execute function public.prevent_teaching_lineage_mutation();

create trigger prevent_interview_topic_suppression_delete
before delete on public.interview_topic_suppressions
for each row
execute function public.prevent_teaching_lineage_mutation();

alter table public.interview_sessions enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_answers enable row level security;
alter table public.interview_answer_teachings enable row level security;
alter table public.interview_topic_suppressions enable row level security;

revoke all on table public.interview_sessions from public, anon, authenticated, service_role;
revoke all on table public.interview_questions from public, anon, authenticated, service_role;
revoke all on table public.interview_answers from public, anon, authenticated, service_role;
revoke all on table public.interview_answer_teachings from public, anon, authenticated, service_role;
revoke all on table public.interview_topic_suppressions from public, anon, authenticated, service_role;

grant select, insert, update on table public.interview_sessions to service_role;
grant select, insert, update on table public.interview_questions to service_role;
grant select, insert, update on table public.interview_answers to service_role;
grant select, insert on table public.interview_answer_teachings to service_role;
grant select, insert on table public.interview_topic_suppressions to service_role;

create policy "Service role manages interview sessions"
on public.interview_sessions for all to service_role using (true) with check (true);

create policy "Service role manages interview questions"
on public.interview_questions for all to service_role using (true) with check (true);

create policy "Service role manages interview answers"
on public.interview_answers for all to service_role using (true) with check (true);

create policy "Service role reads interview answer teachings"
on public.interview_answer_teachings for select to service_role using (true);

create policy "Service role inserts interview answer teachings"
on public.interview_answer_teachings for insert to service_role with check (true);

create policy "Service role reads interview topic suppressions"
on public.interview_topic_suppressions for select to service_role using (true);

create policy "Service role inserts interview topic suppressions"
on public.interview_topic_suppressions for insert to service_role with check (true);

create or replace function public.start_interview_session(p_created_by uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if p_created_by is null then
    raise exception 'invalid interview owner';
  end if;

  select s.id into v_session_id
  from public.interview_sessions s
  where s.created_by = p_created_by and s.status = 'active'
  order by s.created_at desc
  limit 1
  for update;

  if v_session_id is not null then
    return v_session_id;
  end if;

  begin
    insert into public.interview_sessions (created_by)
    values (p_created_by)
    returning id into v_session_id;
  exception when unique_violation then
    select s.id into v_session_id
    from public.interview_sessions s
    where s.created_by = p_created_by and s.status = 'active'
    order by s.created_at desc
    limit 1;
  end;

  return v_session_id;
end;
$$;

create or replace function public.record_interview_question(
  p_session_id uuid,
  p_created_by uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.interview_sessions%rowtype;
  v_open_id uuid;
  v_ordinal integer;
  v_question_id uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid interview question payload';
  end if;

  select * into v_session
  from public.interview_sessions
  where id = p_session_id
    and created_by = p_created_by
    and status = 'active'
  for update;

  if not found then
    raise exception 'interview session not found';
  end if;

  select q.id into v_open_id
  from public.interview_questions q
  where q.session_id = p_session_id and q.status = 'asked'
  limit 1;

  if v_open_id is not null then
    return v_open_id;
  end if;

  if coalesce(jsonb_typeof(p_payload -> 'grounding_sources'), '') <> 'array'
    or jsonb_array_length(p_payload -> 'grounding_sources') not between 1 and 4
    or coalesce(jsonb_typeof(p_payload -> 'relevant_known_facts'), '') <> 'array'
    or jsonb_array_length(p_payload -> 'relevant_known_facts') > 6
    or coalesce(jsonb_typeof(p_payload -> 'follow_up_recommended'), '') <> 'boolean'
    or coalesce(p_payload ->> 'question_fingerprint', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid interview question payload';
  end if;

  select coalesce(max(q.ordinal), 0) + 1 into v_ordinal
  from public.interview_questions q
  where q.session_id = p_session_id;

  insert into public.interview_questions (
    session_id,
    created_by,
    ordinal,
    question,
    topic,
    topic_key,
    why_this_question,
    gap_type,
    grounding_sources,
    relevant_known_facts,
    follow_up_recommended,
    question_fingerprint,
    model,
    prompt_version
  ) values (
    p_session_id,
    p_created_by,
    v_ordinal,
    btrim(p_payload ->> 'question'),
    btrim(p_payload ->> 'topic'),
    btrim(p_payload ->> 'topic_key'),
    btrim(p_payload ->> 'why_this_question'),
    btrim(p_payload ->> 'gap_type'),
    p_payload -> 'grounding_sources',
    p_payload -> 'relevant_known_facts',
    coalesce((p_payload ->> 'follow_up_recommended')::boolean, false),
    p_payload ->> 'question_fingerprint',
    btrim(p_payload ->> 'model'),
    (p_payload ->> 'prompt_version')::integer
  )
  returning id into v_question_id;

  update public.interview_sessions
  set updated_at = timezone('utc', now())
  where id = p_session_id;

  return v_question_id;
exception
  when unique_violation then
    select q.id into v_open_id
    from public.interview_questions q
    where q.session_id = p_session_id and q.status = 'asked'
    limit 1;
    if v_open_id is not null then
      return v_open_id;
    end if;
    raise;
end;
$$;

create or replace function public.submit_interview_answer(
  p_question_id uuid,
  p_created_by uuid,
  p_answer_text text
)
returns table (
  answer_id uuid,
  source_id uuid,
  session_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question public.interview_questions%rowtype;
  v_answer public.interview_answers%rowtype;
  v_source_id uuid;
  v_answer_text text := btrim(coalesce(p_answer_text, ''));
begin
  if char_length(v_answer_text) not between 1 and 16000 then
    raise exception 'invalid interview answer';
  end if;

  select * into v_question
  from public.interview_questions
  where id = p_question_id and created_by = p_created_by
  for update;

  if not found then
    raise exception 'interview question not found';
  end if;

  if v_question.status = 'answered' then
    select * into v_answer
    from public.interview_answers
    where question_id = v_question.id and created_by = p_created_by;

    if found and v_answer.answer_text = v_answer_text then
      return query select v_answer.id, v_answer.source_id, v_answer.session_id;
      return;
    end if;

    raise exception 'interview question already answered';
  end if;

  if v_question.status <> 'asked' then
    raise exception 'interview question is not answerable';
  end if;

  insert into public.teaching_sources (
    source_type,
    title,
    source_uri,
    source_metadata,
    created_by
  ) values (
    'interview',
    left('Interview: ' || v_question.topic, 200),
    null,
    jsonb_build_object(
      'entrypoint', 'interview_eslam',
      'capture_mode', 'written_answer',
      'session_id', v_question.session_id,
      'question_id', v_question.id,
      'question', v_question.question,
      'topic', v_question.topic,
      'gap_type', v_question.gap_type
    ),
    p_created_by
  )
  returning id into v_source_id;

  insert into public.interview_answers (
    session_id,
    question_id,
    source_id,
    created_by,
    answer_text
  ) values (
    v_question.session_id,
    v_question.id,
    v_source_id,
    p_created_by,
    v_answer_text
  )
  returning * into v_answer;

  update public.interview_questions
  set status = 'answered',
      resolved_at = timezone('utc', now())
  where id = v_question.id;

  update public.interview_sessions
  set updated_at = timezone('utc', now())
  where id = v_question.session_id;

  return query select v_answer.id, v_answer.source_id, v_answer.session_id;
end;
$$;

create or replace function public.resolve_interview_question(
  p_question_id uuid,
  p_created_by uuid,
  p_resolution text,
  p_suppress_topic boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question public.interview_questions%rowtype;
begin
  if p_resolution not in ('skipped', 'not_relevant') then
    raise exception 'invalid interview resolution';
  end if;
  if p_suppress_topic and p_resolution <> 'not_relevant' then
    raise exception 'topic suppression requires not relevant';
  end if;

  select * into v_question
  from public.interview_questions
  where id = p_question_id and created_by = p_created_by
  for update;

  if not found then
    raise exception 'interview question not found';
  end if;

  if v_question.status = p_resolution then
    return v_question.session_id;
  end if;

  if v_question.status <> 'asked' then
    raise exception 'interview question is already resolved';
  end if;

  update public.interview_questions
  set status = p_resolution,
      resolved_at = timezone('utc', now())
  where id = v_question.id;

  if p_suppress_topic then
    insert into public.interview_topic_suppressions (
      created_by,
      session_id,
      topic_key,
      topic_label
    ) values (
      p_created_by,
      v_question.session_id,
      v_question.topic_key,
      v_question.topic
    )
    on conflict (created_by, topic_key) do nothing;
  end if;

  update public.interview_sessions
  set updated_at = timezone('utc', now())
  where id = v_question.session_id;

  return v_question.session_id;
end;
$$;

create or replace function public.claim_interview_answer_extraction(
  p_answer_id uuid,
  p_created_by uuid,
  p_model text,
  p_prompt_version integer default 1,
  p_lease_seconds integer default 150
)
returns table (
  answer_id uuid,
  claim_state text,
  claim_token uuid,
  attempt_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_answer public.interview_answers%rowtype;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := timezone('utc', now());
begin
  if p_model is null or char_length(btrim(p_model)) not between 1 and 200
    or p_prompt_version is null or p_prompt_version <= 0
    or p_lease_seconds is null or p_lease_seconds not between 30 and 180 then
    raise exception 'invalid interview extraction claim';
  end if;

  select * into v_answer
  from public.interview_answers
  where id = p_answer_id and created_by = p_created_by
  for update;

  if not found then
    return query select null::uuid, 'not_found'::text, null::uuid, 0;
    return;
  end if;

  if v_answer.extraction_status = 'completed' then
    return query select v_answer.id, 'completed'::text, null::uuid, v_answer.extraction_attempt_count;
    return;
  end if;

  if v_answer.extraction_status = 'processing'
    and v_answer.extraction_lease_expires_at > v_now then
    return query select v_answer.id, 'busy'::text, null::uuid, v_answer.extraction_attempt_count;
    return;
  end if;

  update public.interview_answers as ia
  set extraction_status = 'processing',
      extraction_attempt_count = ia.extraction_attempt_count + 1,
      extraction_claim_token = v_token,
      extraction_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      extraction_model = btrim(p_model),
      extraction_prompt_version = p_prompt_version,
      extraction_last_error_code = null,
      extraction_last_error_at = null,
      updated_at = v_now
  where ia.id = v_answer.id
  returning ia.* into v_answer;

  return query
  select v_answer.id, 'claimed'::text, v_answer.extraction_claim_token, v_answer.extraction_attempt_count;
end;
$$;

create or replace function public.complete_interview_answer_extraction(
  p_answer_id uuid,
  p_created_by uuid,
  p_claim_token uuid,
  p_candidates jsonb
)
returns table (
  candidate_ordinal integer,
  brain_item_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_answer public.interview_answers%rowtype;
  v_question public.interview_questions%rowtype;
  v_candidate jsonb;
  v_ordinal integer;
  v_brain_item_id uuid;
  v_teaching_item_id uuid;
  v_topics text[];
  v_excerpt text;
  v_now timestamptz := timezone('utc', now());
begin
  if p_candidates is null
    or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) > 8 then
    raise exception 'invalid interview teaching candidates';
  end if;

  select * into v_answer
  from public.interview_answers
  where id = p_answer_id and created_by = p_created_by
  for update;

  if not found then
    raise exception 'interview answer not found';
  end if;

  if v_answer.extraction_status = 'completed' then
    return query
    select m.candidate_ordinal, m.brain_item_id
    from public.interview_answer_teachings m
    where m.answer_id = v_answer.id
    order by m.candidate_ordinal;
    return;
  end if;

  if v_answer.extraction_status <> 'processing'
    or v_answer.extraction_claim_token is distinct from p_claim_token
    or v_answer.extraction_lease_expires_at is null
    or v_answer.extraction_lease_expires_at <= v_now then
    raise exception 'interview extraction claim is stale';
  end if;

  select * into v_question
  from public.interview_questions
  where id = v_answer.question_id
    and created_by = p_created_by;

  if not found then
    raise exception 'interview question not found';
  end if;

  for v_candidate, v_ordinal in
    select value, ordinality::integer
    from jsonb_array_elements(p_candidates) with ordinality
  loop
    if coalesce(v_candidate ->> 'semantic_layer', '') not in ('identity', 'brain', 'cases', 'voice')
      or coalesce(v_candidate ->> 'item_type', '') not in (
        'identity_fact', 'principle', 'diagnostic_rule', 'framework', 'hard_rule',
        'example', 'correction', 'contraindication', 'voice_rule'
      )
      or coalesce(jsonb_typeof(v_candidate -> 'priority'), '') <> 'number'
      or (v_candidate ->> 'priority')::integer not between 0 and 1000
      or char_length(btrim(coalesce(v_candidate ->> 'title', ''))) not between 1 and 200
      or char_length(btrim(coalesce(v_candidate ->> 'content', ''))) not between 1 and 16000
      or (
        v_candidate -> 'summary' <> 'null'::jsonb
        and char_length(btrim(coalesce(v_candidate ->> 'summary', ''))) not between 1 and 1200
      )
      or coalesce(jsonb_typeof(v_candidate -> 'topics'), '') <> 'array'
      or jsonb_array_length(v_candidate -> 'topics') > 12 then
      raise exception 'invalid interview teaching candidate';
    end if;

    v_excerpt := btrim(coalesce(v_candidate ->> 'source_excerpt', ''));
    if char_length(v_excerpt) not between 1 and 1000
      or position(v_excerpt in v_answer.answer_text) = 0 then
      raise exception 'interview teaching candidate is not grounded in answer';
    end if;

    select coalesce(array_agg(topic), '{}'::text[]) into v_topics
    from (
      select btrim(value) as topic
      from jsonb_array_elements_text(v_candidate -> 'topics')
    ) t
    where char_length(topic) between 1 and 120;

    if coalesce(array_length(v_topics, 1), 0) <> jsonb_array_length(v_candidate -> 'topics') then
      raise exception 'invalid interview teaching candidate topics';
    end if;

    insert into public.eslam_brain_items (
      semantic_layer,
      item_type,
      status,
      priority,
      created_by
    ) values (
      v_candidate ->> 'semantic_layer',
      v_candidate ->> 'item_type',
      'draft',
      (v_candidate ->> 'priority')::smallint,
      p_created_by
    )
    returning id into v_brain_item_id;

    insert into public.eslam_brain_versions (
      item_id,
      version_number,
      title,
      content,
      summary,
      topics,
      change_note,
      created_by
    ) values (
      v_brain_item_id,
      1,
      btrim(v_candidate ->> 'title'),
      btrim(v_candidate ->> 'content'),
      nullif(btrim(coalesce(v_candidate ->> 'summary', '')), ''),
      v_topics,
      'Extracted from Interview Eslam answer; requires normal Brain review.',
      p_created_by
    );

    insert into public.teaching_items (
      source_id,
      brain_item_id,
      created_by
    ) values (
      v_answer.source_id,
      v_brain_item_id,
      p_created_by
    )
    returning id into v_teaching_item_id;

    insert into public.teaching_versions (
      teaching_item_id,
      brain_item_id,
      version_number,
      source_locator,
      created_by
    ) values (
      v_teaching_item_id,
      v_brain_item_id,
      1,
      jsonb_build_object(
        'kind', 'interview_answer',
        'session_id', v_answer.session_id,
        'question_id', v_answer.question_id,
        'answer_id', v_answer.id,
        'source_excerpt', v_excerpt
      ),
      p_created_by
    );

    insert into public.interview_answer_teachings (
      answer_id,
      candidate_ordinal,
      brain_item_id,
      created_by
    ) values (
      v_answer.id,
      v_ordinal,
      v_brain_item_id,
      p_created_by
    );
  end loop;

  update public.interview_answers
  set extraction_status = 'completed',
      extraction_claim_token = null,
      extraction_lease_expires_at = null,
      extraction_last_error_code = null,
      extraction_last_error_at = null,
      extraction_completed_at = v_now,
      updated_at = v_now
  where id = v_answer.id;

  return query
  select m.candidate_ordinal, m.brain_item_id
  from public.interview_answer_teachings m
  where m.answer_id = v_answer.id
  order by m.candidate_ordinal;
end;
$$;

create or replace function public.fail_interview_answer_extraction(
  p_answer_id uuid,
  p_created_by uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_error_code is null or char_length(btrim(p_error_code)) not between 1 and 120 then
    raise exception 'invalid interview extraction error code';
  end if;

  update public.interview_answers
  set extraction_status = 'failed',
      extraction_claim_token = null,
      extraction_lease_expires_at = null,
      extraction_last_error_code = btrim(p_error_code),
      extraction_last_error_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_answer_id
    and created_by = p_created_by
    and extraction_status = 'processing'
    and extraction_claim_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.start_interview_session(uuid)
from public, anon, authenticated;
revoke execute on function public.record_interview_question(uuid, uuid, jsonb)
from public, anon, authenticated;
revoke execute on function public.submit_interview_answer(uuid, uuid, text)
from public, anon, authenticated;
revoke execute on function public.resolve_interview_question(uuid, uuid, text, boolean)
from public, anon, authenticated;
revoke execute on function public.claim_interview_answer_extraction(uuid, uuid, text, integer, integer)
from public, anon, authenticated;
revoke execute on function public.complete_interview_answer_extraction(uuid, uuid, uuid, jsonb)
from public, anon, authenticated;
revoke execute on function public.fail_interview_answer_extraction(uuid, uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.start_interview_session(uuid) to service_role;
grant execute on function public.record_interview_question(uuid, uuid, jsonb) to service_role;
grant execute on function public.submit_interview_answer(uuid, uuid, text) to service_role;
grant execute on function public.resolve_interview_question(uuid, uuid, text, boolean) to service_role;
grant execute on function public.claim_interview_answer_extraction(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.complete_interview_answer_extraction(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_interview_answer_extraction(uuid, uuid, uuid, text) to service_role;

revoke all on function public.prevent_interview_question_content_mutation()
from public, anon, authenticated, service_role;
revoke all on function public.prevent_interview_answer_content_mutation()
from public, anon, authenticated, service_role;
