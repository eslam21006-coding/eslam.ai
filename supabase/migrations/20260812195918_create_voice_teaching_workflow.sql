create table public.voice_teaching_extractions (
  id uuid primary key default gen_random_uuid(),
  voice_transcription_id uuid not null unique references public.voice_transcriptions(id) on delete restrict,
  voice_recording_id uuid not null references public.voice_recordings(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null,
  model text not null,
  prompt_version integer not null default 1,
  attempt_count integer not null default 1,
  processing_started_at timestamptz,
  lease_expires_at timestamptz,
  claim_token uuid,
  completed_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint voice_teaching_extractions_status_check check (status in ('processing', 'completed', 'failed')),
  constraint voice_teaching_extractions_model_check check (char_length(btrim(model)) between 1 and 120),
  constraint voice_teaching_extractions_prompt_version_check check (prompt_version between 1 and 1000),
  constraint voice_teaching_extractions_attempt_count_check check (attempt_count between 1 and 1000),
  constraint voice_teaching_extractions_error_code_check check (
    last_error_code is null or char_length(btrim(last_error_code)) between 1 and 120
  ),
  constraint voice_teaching_extractions_state_check check (
    (
      status = 'processing'
      and processing_started_at is not null
      and lease_expires_at is not null
      and claim_token is not null
      and completed_at is null
      and last_error_code is null
      and last_error_at is null
    )
    or (
      status = 'completed'
      and processing_started_at is not null
      and lease_expires_at is null
      and claim_token is null
      and completed_at is not null
      and last_error_code is null
      and last_error_at is null
    )
    or (
      status = 'failed'
      and processing_started_at is not null
      and lease_expires_at is null
      and claim_token is null
      and completed_at is null
      and last_error_code is not null
      and last_error_at is not null
    )
  )
);

create table public.voice_teaching_candidates (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.voice_teaching_extractions(id) on delete restrict,
  ordinal integer not null check (ordinal between 1 and 12),
  semantic_layer text not null check (semantic_layer in ('identity', 'brain', 'cases', 'voice')),
  item_type text not null check (
    item_type in (
      'identity_fact',
      'principle',
      'diagnostic_rule',
      'framework',
      'hard_rule',
      'example',
      'correction',
      'contraindication',
      'voice_rule'
    )
  ),
  priority integer not null check (priority between 0 and 1000),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 16000),
  summary text check (summary is null or char_length(btrim(summary)) between 1 and 1200),
  topics text[] not null default '{}'::text[] check (cardinality(topics) <= 12),
  source_excerpt text not null check (char_length(btrim(source_excerpt)) between 1 and 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint voice_teaching_candidates_extraction_ordinal_unique unique (extraction_id, ordinal)
);

create table public.voice_teaching_candidate_drafts (
  candidate_id uuid primary key references public.voice_teaching_candidates(id) on delete restrict,
  brain_item_id uuid not null unique references public.eslam_brain_items(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index voice_teaching_extractions_owner_created_idx
  on public.voice_teaching_extractions (created_by, created_at desc);
create index voice_teaching_extractions_owner_status_lease_idx
  on public.voice_teaching_extractions (created_by, status, lease_expires_at);
create index voice_teaching_candidates_extraction_idx
  on public.voice_teaching_candidates (extraction_id, ordinal);
create index voice_teaching_candidate_drafts_brain_item_idx
  on public.voice_teaching_candidate_drafts (brain_item_id);

alter table public.voice_teaching_extractions enable row level security;
alter table public.voice_teaching_candidates enable row level security;
alter table public.voice_teaching_candidate_drafts enable row level security;

revoke all on table public.voice_teaching_extractions from public, anon, authenticated, service_role;
revoke all on table public.voice_teaching_candidates from public, anon, authenticated, service_role;
revoke all on table public.voice_teaching_candidate_drafts from public, anon, authenticated, service_role;

grant select, insert, update on table public.voice_teaching_extractions to service_role;
grant select, insert on table public.voice_teaching_candidates to service_role;
grant select, insert on table public.voice_teaching_candidate_drafts to service_role;

create policy "voice teaching extractions deny anon select"
  on public.voice_teaching_extractions for select to anon using (false);
create policy "voice teaching extractions deny authenticated select"
  on public.voice_teaching_extractions for select to authenticated using (false);
create policy "voice teaching candidates deny anon select"
  on public.voice_teaching_candidates for select to anon using (false);
create policy "voice teaching candidates deny authenticated select"
  on public.voice_teaching_candidates for select to authenticated using (false);
create policy "voice teaching candidate drafts deny anon select"
  on public.voice_teaching_candidate_drafts for select to anon using (false);
create policy "voice teaching candidate drafts deny authenticated select"
  on public.voice_teaching_candidate_drafts for select to authenticated using (false);

comment on table public.voice_teaching_extractions is
  'Admin-only extraction lifecycle from immutable completed voice transcripts. Extraction never publishes Brain content.';
comment on table public.voice_teaching_candidates is
  'Immutable AI-proposed teaching candidates derived from a completed voice transcript.';
comment on table public.voice_teaching_candidate_drafts is
  'Append-only mapping proving a voice candidate was materialized into one Brain draft.';

create or replace function public.prevent_completed_voice_teaching_extraction_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed' and new is distinct from old then
    raise exception 'completed voice teaching extractions are immutable';
  end if;
  return new;
end;
$$;

create trigger prevent_completed_voice_teaching_extraction_mutation
before update on public.voice_teaching_extractions
for each row execute function public.prevent_completed_voice_teaching_extraction_mutation();

create or replace function public.prevent_voice_teaching_candidate_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'voice teaching candidate lineage is immutable' using errcode = '55000';
end;
$$;

create trigger prevent_voice_teaching_candidate_update
before update on public.voice_teaching_candidates
for each row execute function public.prevent_voice_teaching_candidate_mutation();
create trigger prevent_voice_teaching_candidate_delete
before delete on public.voice_teaching_candidates
for each row execute function public.prevent_voice_teaching_candidate_mutation();
create trigger prevent_voice_teaching_candidate_draft_update
before update on public.voice_teaching_candidate_drafts
for each row execute function public.prevent_voice_teaching_candidate_mutation();
create trigger prevent_voice_teaching_candidate_draft_delete
before delete on public.voice_teaching_candidate_drafts
for each row execute function public.prevent_voice_teaching_candidate_mutation();

create or replace function public.claim_voice_teaching_extraction(
  p_transcription_id uuid,
  p_created_by uuid,
  p_model text,
  p_prompt_version integer default 1,
  p_lease_seconds integer default 150
)
returns table (
  extraction_id uuid,
  claim_state text,
  attempt_count integer,
  claim_token uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_lease_expires_at timestamptz;
  v_claim_token uuid := gen_random_uuid();
  v_recording_id uuid;
  v_row public.voice_teaching_extractions%rowtype;
begin
  if p_transcription_id is null or p_created_by is null then
    raise exception 'transcription and creator are required';
  end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 120 then
    raise exception 'invalid voice teaching model';
  end if;
  if p_prompt_version is null or p_prompt_version not between 1 and 1000 then
    raise exception 'invalid voice teaching prompt version';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 60 and 1800 then
    raise exception 'invalid voice teaching lease';
  end if;

  select vt.voice_recording_id into v_recording_id
  from public.voice_transcriptions vt
  join public.voice_recordings vr on vr.id = vt.voice_recording_id
  where vt.id = p_transcription_id
    and vt.created_by = p_created_by
    and vt.status = 'completed'
    and vt.transcript_text is not null
    and vr.created_by = p_created_by
    and vr.status = 'uploaded';

  if v_recording_id is null then
    return query select null::uuid, 'not_found'::text, 0, null::uuid;
    return;
  end if;

  v_lease_expires_at := v_now + make_interval(secs => p_lease_seconds);

  insert into public.voice_teaching_extractions (
    voice_transcription_id,
    voice_recording_id,
    created_by,
    status,
    model,
    prompt_version,
    attempt_count,
    processing_started_at,
    lease_expires_at,
    claim_token,
    created_at,
    updated_at
  ) values (
    p_transcription_id,
    v_recording_id,
    p_created_by,
    'processing',
    btrim(p_model),
    p_prompt_version,
    1,
    v_now,
    v_lease_expires_at,
    v_claim_token,
    v_now,
    v_now
  )
  on conflict (voice_transcription_id) do update
  set status = 'processing',
      model = excluded.model,
      prompt_version = excluded.prompt_version,
      attempt_count = public.voice_teaching_extractions.attempt_count + 1,
      processing_started_at = v_now,
      lease_expires_at = v_lease_expires_at,
      claim_token = v_claim_token,
      completed_at = null,
      last_error_code = null,
      last_error_at = null,
      updated_at = v_now
  where public.voice_teaching_extractions.created_by = p_created_by
    and (
      public.voice_teaching_extractions.status = 'failed'
      or (
        public.voice_teaching_extractions.status = 'processing'
        and public.voice_teaching_extractions.lease_expires_at <= v_now
      )
    )
  returning * into v_row;

  if found then
    return query select v_row.id, 'claimed'::text, v_row.attempt_count, v_row.claim_token;
    return;
  end if;

  select * into v_row
  from public.voice_teaching_extractions vte
  where vte.voice_transcription_id = p_transcription_id
    and vte.created_by = p_created_by;

  if not found then
    return query select null::uuid, 'not_found'::text, 0, null::uuid;
  elsif v_row.status = 'completed' then
    return query select v_row.id, 'completed'::text, v_row.attempt_count, null::uuid;
  else
    return query select v_row.id, 'busy'::text, v_row.attempt_count, null::uuid;
  end if;
end;
$$;

create or replace function public.complete_voice_teaching_extraction(
  p_extraction_id uuid,
  p_created_by uuid,
  p_claim_token uuid,
  p_candidates jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.voice_teaching_extractions%rowtype;
  v_candidate jsonb;
  v_ordinal integer := 0;
  v_topics text[];
  v_priority integer;
begin
  if p_candidates is null
    or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) > 12 then
    raise exception 'invalid voice teaching candidates';
  end if;

  select * into v_row
  from public.voice_teaching_extractions
  where id = p_extraction_id
    and created_by = p_created_by
  for update;

  if not found
    or v_row.status <> 'processing'
    or v_row.claim_token is distinct from p_claim_token
    or v_row.lease_expires_at <= timezone('utc', now()) then
    return false;
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    v_ordinal := v_ordinal + 1;
    if jsonb_typeof(v_candidate) <> 'object' then
      raise exception 'invalid voice teaching candidate';
    end if;
    if coalesce(v_candidate ->> 'semantic_layer', '') not in ('identity', 'brain', 'cases', 'voice') then
      raise exception 'invalid voice teaching semantic layer';
    end if;
    if coalesce(v_candidate ->> 'item_type', '') not in (
      'identity_fact', 'principle', 'diagnostic_rule', 'framework', 'hard_rule',
      'example', 'correction', 'contraindication', 'voice_rule'
    ) then
      raise exception 'invalid voice teaching item type';
    end if;
    if coalesce(v_candidate ->> 'priority', '') !~ '^[0-9]{1,4}$' then
      raise exception 'invalid voice teaching priority';
    end if;
    v_priority := (v_candidate ->> 'priority')::integer;
    if v_priority not between 0 and 1000 then
      raise exception 'invalid voice teaching priority';
    end if;
    if char_length(btrim(coalesce(v_candidate ->> 'title', ''))) not between 1 and 200 then
      raise exception 'invalid voice teaching title';
    end if;
    if char_length(btrim(coalesce(v_candidate ->> 'content', ''))) not between 1 and 16000 then
      raise exception 'invalid voice teaching content';
    end if;
    if v_candidate ? 'summary'
      and v_candidate ->> 'summary' is not null
      and char_length(btrim(v_candidate ->> 'summary')) not between 1 and 1200 then
      raise exception 'invalid voice teaching summary';
    end if;
    if char_length(btrim(coalesce(v_candidate ->> 'source_excerpt', ''))) not between 1 and 1000 then
      raise exception 'invalid voice teaching source excerpt';
    end if;
    if jsonb_typeof(coalesce(v_candidate -> 'topics', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(v_candidate -> 'topics', '[]'::jsonb)) > 12 then
      raise exception 'invalid voice teaching topics';
    end if;

    v_topics := array(
      select btrim(value)
      from jsonb_array_elements_text(coalesce(v_candidate -> 'topics', '[]'::jsonb))
    );
    if exists (
      select 1 from unnest(v_topics) as topic
      where char_length(topic) = 0 or char_length(topic) > 120
    ) then
      raise exception 'invalid voice teaching topic';
    end if;

    insert into public.voice_teaching_candidates (
      extraction_id,
      ordinal,
      semantic_layer,
      item_type,
      priority,
      title,
      content,
      summary,
      topics,
      source_excerpt,
      created_by
    ) values (
      p_extraction_id,
      v_ordinal,
      v_candidate ->> 'semantic_layer',
      v_candidate ->> 'item_type',
      v_priority,
      btrim(v_candidate ->> 'title'),
      btrim(v_candidate ->> 'content'),
      nullif(btrim(coalesce(v_candidate ->> 'summary', '')), ''),
      v_topics,
      btrim(v_candidate ->> 'source_excerpt'),
      p_created_by
    );
  end loop;

  update public.voice_teaching_extractions
  set status = 'completed',
      lease_expires_at = null,
      claim_token = null,
      completed_at = timezone('utc', now()),
      last_error_code = null,
      last_error_at = null,
      updated_at = timezone('utc', now())
  where id = p_extraction_id
    and created_by = p_created_by
    and status = 'processing'
    and claim_token = p_claim_token;

  return found;
end;
$$;

create or replace function public.fail_voice_teaching_extraction(
  p_extraction_id uuid,
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
    raise exception 'invalid voice teaching error code';
  end if;

  update public.voice_teaching_extractions
  set status = 'failed',
      lease_expires_at = null,
      claim_token = null,
      completed_at = null,
      last_error_code = btrim(p_error_code),
      last_error_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_extraction_id
    and created_by = p_created_by
    and status = 'processing'
    and claim_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.create_voice_teaching_drafts(
  p_extraction_id uuid,
  p_created_by uuid,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_extraction public.voice_teaching_extractions%rowtype;
  v_payload jsonb;
  v_candidate public.voice_teaching_candidates%rowtype;
  v_candidate_id uuid;
  v_source_id uuid;
  v_brain_item_id uuid;
  v_teaching_item_id uuid;
  v_topics text[];
  v_priority integer;
  v_results jsonb := '[]'::jsonb;
begin
  if p_candidates is null
    or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) not between 1 and 12 then
    raise exception 'invalid selected voice teaching candidates';
  end if;

  select * into v_extraction
  from public.voice_teaching_extractions
  where id = p_extraction_id
    and created_by = p_created_by
    and status = 'completed'
  for share;

  if not found then
    raise exception 'voice teaching extraction not found';
  end if;

  for v_payload in select value from jsonb_array_elements(p_candidates)
  loop
    if jsonb_typeof(v_payload) <> 'object' then
      raise exception 'invalid selected voice teaching candidate';
    end if;

    begin
      v_candidate_id := (v_payload ->> 'candidate_id')::uuid;
    exception when others then
      raise exception 'invalid selected voice teaching candidate id';
    end;

    select * into v_candidate
    from public.voice_teaching_candidates
    where id = v_candidate_id
      and extraction_id = p_extraction_id
      and created_by = p_created_by;

    if not found then
      raise exception 'voice teaching candidate not found';
    end if;

    if exists (
      select 1
      from public.voice_teaching_candidate_drafts
      where candidate_id = v_candidate_id
    ) then
      raise exception 'voice teaching candidate already materialized';
    end if;

    if coalesce(v_payload ->> 'semantic_layer', '') not in ('identity', 'brain', 'cases', 'voice') then
      raise exception 'invalid selected semantic layer';
    end if;
    if coalesce(v_payload ->> 'item_type', '') not in (
      'identity_fact', 'principle', 'diagnostic_rule', 'framework', 'hard_rule',
      'example', 'correction', 'contraindication', 'voice_rule'
    ) then
      raise exception 'invalid selected item type';
    end if;
    if coalesce(v_payload ->> 'priority', '') !~ '^[0-9]{1,4}$' then
      raise exception 'invalid selected priority';
    end if;
    v_priority := (v_payload ->> 'priority')::integer;
    if v_priority not between 0 and 1000 then
      raise exception 'invalid selected priority';
    end if;
    if char_length(btrim(coalesce(v_payload ->> 'title', ''))) not between 1 and 200 then
      raise exception 'invalid selected title';
    end if;
    if char_length(btrim(coalesce(v_payload ->> 'content', ''))) not between 1 and 16000 then
      raise exception 'invalid selected content';
    end if;
    if char_length(btrim(coalesce(v_payload ->> 'summary', ''))) > 1200 then
      raise exception 'invalid selected summary';
    end if;
    if char_length(btrim(coalesce(v_payload ->> 'change_note', ''))) > 1000 then
      raise exception 'invalid selected change note';
    end if;
    if jsonb_typeof(coalesce(v_payload -> 'topics', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(v_payload -> 'topics', '[]'::jsonb)) > 12 then
      raise exception 'invalid selected topics';
    end if;

    v_topics := array(
      select btrim(value)
      from jsonb_array_elements_text(coalesce(v_payload -> 'topics', '[]'::jsonb))
    );
    if exists (
      select 1 from unnest(v_topics) as topic
      where char_length(topic) = 0 or char_length(topic) > 120
    ) then
      raise exception 'invalid selected topic';
    end if;

    insert into public.teaching_sources (
      source_type,
      title,
      source_uri,
      source_metadata,
      created_by
    ) values (
      'voice',
      btrim(v_payload ->> 'title'),
      null,
      jsonb_build_object(
        'entrypoint', 'voice_to_teaching',
        'capture_mode', 'voice_transcript',
        'voice_recording_id', v_extraction.voice_recording_id,
        'voice_transcription_id', v_extraction.voice_transcription_id,
        'voice_teaching_extraction_id', v_extraction.id,
        'voice_teaching_candidate_id', v_candidate.id,
        'candidate_ordinal', v_candidate.ordinal,
        'source_excerpt', v_candidate.source_excerpt
      ),
      p_created_by
    ) returning id into v_source_id;

    insert into public.eslam_brain_items (
      semantic_layer,
      item_type,
      status,
      priority,
      created_by
    ) values (
      v_payload ->> 'semantic_layer',
      v_payload ->> 'item_type',
      'draft',
      v_priority,
      p_created_by
    ) returning id into v_brain_item_id;

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
      btrim(v_payload ->> 'title'),
      btrim(v_payload ->> 'content'),
      nullif(btrim(coalesce(v_payload ->> 'summary', '')), ''),
      v_topics,
      nullif(btrim(coalesce(v_payload ->> 'change_note', '')), ''),
      p_created_by
    );

    insert into public.teaching_items (
      source_id,
      brain_item_id,
      created_by
    ) values (
      v_source_id,
      v_brain_item_id,
      p_created_by
    ) returning id into v_teaching_item_id;

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
        'kind', 'voice_transcript_candidate',
        'voice_recording_id', v_extraction.voice_recording_id,
        'voice_transcription_id', v_extraction.voice_transcription_id,
        'voice_teaching_extraction_id', v_extraction.id,
        'voice_teaching_candidate_id', v_candidate.id,
        'candidate_ordinal', v_candidate.ordinal
      ),
      p_created_by
    );

    insert into public.voice_teaching_candidate_drafts (
      candidate_id,
      brain_item_id,
      created_by
    ) values (
      v_candidate.id,
      v_brain_item_id,
      p_created_by
    );

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'candidate_id', v_candidate.id,
        'brain_item_id', v_brain_item_id,
        'version_number', 1
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.claim_voice_teaching_extraction(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_voice_teaching_extraction(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_voice_teaching_extraction(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_voice_teaching_drafts(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.prevent_completed_voice_teaching_extraction_mutation()
  from public, anon, authenticated;
revoke all on function public.prevent_voice_teaching_candidate_mutation()
  from public, anon, authenticated;

grant execute on function public.claim_voice_teaching_extraction(uuid, uuid, text, integer, integer)
  to service_role;
grant execute on function public.complete_voice_teaching_extraction(uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.fail_voice_teaching_extraction(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.create_voice_teaching_drafts(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.prevent_completed_voice_teaching_extraction_mutation()
  to service_role;
grant execute on function public.prevent_voice_teaching_candidate_mutation()
  to service_role;
