create table public.document_teaching_extractions (
  id uuid primary key default gen_random_uuid(),
  document_upload_id uuid not null unique references public.document_teaching_uploads(id) on delete restrict,
  source_id uuid not null references public.teaching_sources(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('processing', 'completed', 'failed')),
  model text not null check (char_length(btrim(model)) between 1 and 200),
  prompt_version integer not null default 1 check (prompt_version > 0),
  attempt_count integer not null default 1 check (attempt_count > 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(btrim(last_error_code)) between 1 and 120),
  last_error_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint document_teaching_extractions_state_check check (
    (status = 'processing' and claim_token is not null and lease_expires_at is not null and processing_started_at is not null and completed_at is null)
    or
    (status = 'completed' and claim_token is null and lease_expires_at is null and completed_at is not null)
    or
    (status = 'failed' and claim_token is null and lease_expires_at is null and completed_at is null)
  )
);

create table public.document_teaching_candidates (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.document_teaching_extractions(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 12),
  semantic_layer text not null check (semantic_layer in ('identity', 'brain', 'cases', 'voice')),
  item_type text not null check (item_type in ('identity_fact', 'principle', 'diagnostic_rule', 'framework', 'hard_rule', 'example', 'correction', 'contraindication', 'voice_rule')),
  priority integer not null check (priority between 0 and 1000),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) between 1 and 16000),
  summary text check (summary is null or char_length(btrim(summary)) between 1 and 1200),
  topics text[] not null default '{}'::text[] check (cardinality(topics) <= 12),
  source_excerpt text not null check (char_length(btrim(source_excerpt)) between 1 and 1000),
  source_locator text not null check (char_length(btrim(source_locator)) between 1 and 300),
  created_at timestamptz not null default timezone('utc', now()),
  constraint document_teaching_candidates_extraction_ordinal_unique unique (extraction_id, ordinal)
);

create table public.document_teaching_candidate_drafts (
  candidate_id uuid primary key references public.document_teaching_candidates(id) on delete restrict,
  brain_item_id uuid not null unique references public.eslam_brain_items(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index document_teaching_extractions_owner_created_idx on public.document_teaching_extractions (created_by, created_at desc);
create index document_teaching_extractions_source_id_idx on public.document_teaching_extractions (source_id);
create index document_teaching_candidates_extraction_id_idx on public.document_teaching_candidates (extraction_id);
create index document_teaching_candidates_created_by_idx on public.document_teaching_candidates (created_by);
create index document_teaching_candidate_drafts_created_by_idx on public.document_teaching_candidate_drafts (created_by);

create or replace function public.prevent_document_teaching_candidate_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'document teaching candidate audit records are immutable' using errcode = '55000';
end;
$$;

create trigger prevent_document_teaching_candidate_update before update on public.document_teaching_candidates for each row execute function public.prevent_document_teaching_candidate_mutation();
create trigger prevent_document_teaching_candidate_delete before delete on public.document_teaching_candidates for each row execute function public.prevent_document_teaching_candidate_mutation();
create trigger prevent_document_teaching_candidate_draft_update before update on public.document_teaching_candidate_drafts for each row execute function public.prevent_document_teaching_candidate_mutation();
create trigger prevent_document_teaching_candidate_draft_delete before delete on public.document_teaching_candidate_drafts for each row execute function public.prevent_document_teaching_candidate_mutation();

create or replace function public.prevent_completed_document_teaching_extraction_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'completed' then
    raise exception 'completed document teaching extraction is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger prevent_completed_document_teaching_extraction_update before update on public.document_teaching_extractions for each row execute function public.prevent_completed_document_teaching_extraction_mutation();
create trigger prevent_document_teaching_extraction_delete before delete on public.document_teaching_extractions for each row execute function public.prevent_document_teaching_candidate_mutation();

alter table public.document_teaching_extractions enable row level security;
alter table public.document_teaching_candidates enable row level security;
alter table public.document_teaching_candidate_drafts enable row level security;
revoke all on table public.document_teaching_extractions from public, anon, authenticated;
revoke all on table public.document_teaching_candidates from public, anon, authenticated;
revoke all on table public.document_teaching_candidate_drafts from public, anon, authenticated;
grant select, insert, update on table public.document_teaching_extractions to service_role;
grant select, insert on table public.document_teaching_candidates to service_role;
grant select, insert on table public.document_teaching_candidate_drafts to service_role;

create policy "Service role manages document teaching extractions" on public.document_teaching_extractions for all to service_role using (true) with check (true);
create policy "Service role reads document teaching candidates" on public.document_teaching_candidates for select to service_role using (true);
create policy "Service role inserts document teaching candidates" on public.document_teaching_candidates for insert to service_role with check (true);
create policy "Service role reads document teaching draft mappings" on public.document_teaching_candidate_drafts for select to service_role using (true);
create policy "Service role inserts document teaching draft mappings" on public.document_teaching_candidate_drafts for insert to service_role with check (true);

create or replace function public.claim_document_teaching_extraction(
  p_document_id uuid,
  p_created_by uuid,
  p_model text,
  p_prompt_version integer default 1,
  p_lease_seconds integer default 180
)
returns table (extraction_id uuid, claim_state text, attempt_count integer, claim_token uuid)
language plpgsql security invoker set search_path = '' as $$
declare
  v_document public.document_teaching_uploads%rowtype;
  v_extraction public.document_teaching_extractions%rowtype;
  v_token uuid := gen_random_uuid();
  v_now timestamptz := timezone('utc', now());
begin
  if p_model is null or char_length(btrim(p_model)) not between 1 and 200
    or p_prompt_version is null or p_prompt_version <= 0
    or p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid document teaching extraction claim';
  end if;
  select * into v_document from public.document_teaching_uploads
  where id = p_document_id and created_by = p_created_by and status = 'uploaded' and source_id is not null for share;
  if not found then return query select null::uuid, 'not_found'::text, 0, null::uuid; return; end if;
  select * into v_extraction from public.document_teaching_extractions where document_upload_id = p_document_id and created_by = p_created_by for update;
  if not found then
    insert into public.document_teaching_extractions (document_upload_id, source_id, created_by, status, model, prompt_version, attempt_count, claim_token, lease_expires_at, processing_started_at)
    values (p_document_id, v_document.source_id, p_created_by, 'processing', btrim(p_model), p_prompt_version, 1, v_token, v_now + make_interval(secs => p_lease_seconds), v_now)
    returning * into v_extraction;
    return query select v_extraction.id, 'claimed'::text, v_extraction.attempt_count, v_extraction.claim_token; return;
  end if;
  if v_extraction.status = 'completed' then return query select v_extraction.id, 'completed'::text, v_extraction.attempt_count, null::uuid; return; end if;
  if v_extraction.status = 'processing' and v_extraction.lease_expires_at > v_now then return query select v_extraction.id, 'busy'::text, v_extraction.attempt_count, null::uuid; return; end if;
  update public.document_teaching_extractions set status='processing', model=btrim(p_model), prompt_version=p_prompt_version, attempt_count=attempt_count+1, claim_token=v_token, lease_expires_at=v_now+make_interval(secs=>p_lease_seconds), processing_started_at=v_now, completed_at=null, last_error_code=null, last_error_at=null, updated_at=v_now where id=v_extraction.id returning * into v_extraction;
  return query select v_extraction.id, 'claimed'::text, v_extraction.attempt_count, v_extraction.claim_token;
end;
$$;

create or replace function public.complete_document_teaching_extraction(p_extraction_id uuid,p_created_by uuid,p_claim_token uuid,p_candidates jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_extraction public.document_teaching_extractions%rowtype;
  v_candidate jsonb;
  v_ordinal integer := 0;
  v_topics text[];
  v_now timestamptz := timezone('utc', now());
begin
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 12 then raise exception 'invalid document teaching candidates'; end if;
  select * into v_extraction from public.document_teaching_extractions where id=p_extraction_id and created_by=p_created_by and status='processing' and claim_token=p_claim_token for update;
  if not found then return false; end if;
  if exists (select 1 from public.document_teaching_candidates where extraction_id=p_extraction_id) then return false; end if;
  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    v_ordinal := v_ordinal + 1;
    if jsonb_typeof(v_candidate) <> 'object' then raise exception 'invalid document teaching candidate'; end if;
    if coalesce(v_candidate->>'semantic_layer','') not in ('identity','brain','cases','voice') then raise exception 'invalid semantic layer'; end if;
    if coalesce(v_candidate->>'item_type','') not in ('identity_fact','principle','diagnostic_rule','framework','hard_rule','example','correction','contraindication','voice_rule') then raise exception 'invalid item type'; end if;
    if coalesce(v_candidate->>'priority','') !~ '^[0-9]{1,4}$' or (v_candidate->>'priority')::integer not between 0 and 1000 then raise exception 'invalid priority'; end if;
    if char_length(btrim(coalesce(v_candidate->>'title',''))) not between 1 and 200 then raise exception 'invalid title'; end if;
    if char_length(btrim(coalesce(v_candidate->>'content',''))) not between 1 and 16000 then raise exception 'invalid content'; end if;
    if nullif(btrim(coalesce(v_candidate->>'summary','')), '') is not null and char_length(btrim(v_candidate->>'summary')) > 1200 then raise exception 'invalid summary'; end if;
    if char_length(btrim(coalesce(v_candidate->>'source_excerpt',''))) not between 1 and 1000 then raise exception 'invalid source excerpt'; end if;
    if char_length(btrim(coalesce(v_candidate->>'source_locator',''))) not between 1 and 300 then raise exception 'invalid source locator'; end if;
    if jsonb_typeof(coalesce(v_candidate->'topics','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v_candidate->'topics','[]'::jsonb)) > 12 then raise exception 'invalid topics'; end if;
    v_topics := array(select btrim(value) from jsonb_array_elements_text(coalesce(v_candidate->'topics','[]'::jsonb)));
    if exists (select 1 from unnest(v_topics) topic where char_length(topic)=0 or char_length(topic)>120) then raise exception 'invalid topic'; end if;
    insert into public.document_teaching_candidates (extraction_id,created_by,ordinal,semantic_layer,item_type,priority,title,content,summary,topics,source_excerpt,source_locator)
    values (p_extraction_id,p_created_by,v_ordinal,v_candidate->>'semantic_layer',v_candidate->>'item_type',(v_candidate->>'priority')::integer,btrim(v_candidate->>'title'),btrim(v_candidate->>'content'),nullif(btrim(coalesce(v_candidate->>'summary','')),''),v_topics,btrim(v_candidate->>'source_excerpt'),btrim(v_candidate->>'source_locator'));
  end loop;
  update public.document_teaching_extractions set status='completed',claim_token=null,lease_expires_at=null,completed_at=v_now,updated_at=v_now where id=p_extraction_id;
  return true;
end;
$$;

create or replace function public.fail_document_teaching_extraction(p_extraction_id uuid,p_created_by uuid,p_claim_token uuid,p_error_code text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_updated integer;
begin
  if p_error_code is null or char_length(btrim(p_error_code)) not between 1 and 120 then raise exception 'invalid document teaching error code'; end if;
  update public.document_teaching_extractions set status='failed',claim_token=null,lease_expires_at=null,completed_at=null,last_error_code=btrim(p_error_code),last_error_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=p_extraction_id and created_by=p_created_by and status='processing' and claim_token=p_claim_token;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.create_document_teaching_drafts(p_extraction_id uuid,p_created_by uuid,p_candidates jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_extraction public.document_teaching_extractions%rowtype;
  v_payload jsonb;
  v_candidate public.document_teaching_candidates%rowtype;
  v_candidate_id uuid;
  v_brain_item_id uuid;
  v_teaching_item_id uuid;
  v_topics text[];
  v_priority integer;
  v_results jsonb := '[]'::jsonb;
begin
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) not between 1 and 12 then raise exception 'invalid selected document teaching candidates'; end if;
  select * into v_extraction from public.document_teaching_extractions where id=p_extraction_id and created_by=p_created_by and status='completed' for share;
  if not found then raise exception 'document teaching extraction not found'; end if;
  for v_payload in select value from jsonb_array_elements(p_candidates) loop
    begin v_candidate_id := (v_payload->>'candidate_id')::uuid; exception when others then raise exception 'invalid selected document teaching candidate id'; end;
    select * into v_candidate from public.document_teaching_candidates where id=v_candidate_id and extraction_id=p_extraction_id and created_by=p_created_by;
    if not found then raise exception 'document teaching candidate not found'; end if;
    if exists (select 1 from public.document_teaching_candidate_drafts where candidate_id=v_candidate_id) then raise exception 'document teaching candidate already materialized'; end if;
    if coalesce(v_payload->>'semantic_layer','') not in ('identity','brain','cases','voice') then raise exception 'invalid selected semantic layer'; end if;
    if coalesce(v_payload->>'item_type','') not in ('identity_fact','principle','diagnostic_rule','framework','hard_rule','example','correction','contraindication','voice_rule') then raise exception 'invalid selected item type'; end if;
    if coalesce(v_payload->>'priority','') !~ '^[0-9]{1,4}$' then raise exception 'invalid selected priority'; end if;
    v_priority := (v_payload->>'priority')::integer;
    if v_priority not between 0 and 1000 then raise exception 'invalid selected priority'; end if;
    if char_length(btrim(coalesce(v_payload->>'title',''))) not between 1 and 200 then raise exception 'invalid selected title'; end if;
    if char_length(btrim(coalesce(v_payload->>'content',''))) not between 1 and 16000 then raise exception 'invalid selected content'; end if;
    if char_length(btrim(coalesce(v_payload->>'summary',''))) > 1200 then raise exception 'invalid selected summary'; end if;
    if char_length(btrim(coalesce(v_payload->>'change_note',''))) > 1000 then raise exception 'invalid selected change note'; end if;
    if jsonb_typeof(coalesce(v_payload->'topics','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v_payload->'topics','[]'::jsonb)) > 12 then raise exception 'invalid selected topics'; end if;
    v_topics := array(select btrim(value) from jsonb_array_elements_text(coalesce(v_payload->'topics','[]'::jsonb)));
    if exists (select 1 from unnest(v_topics) topic where char_length(topic)=0 or char_length(topic)>120) then raise exception 'invalid selected topic'; end if;
    insert into public.eslam_brain_items (semantic_layer,item_type,status,priority,created_by) values (v_payload->>'semantic_layer',v_payload->>'item_type','draft',v_priority,p_created_by) returning id into v_brain_item_id;
    insert into public.eslam_brain_versions (item_id,version_number,title,content,summary,topics,change_note,created_by) values (v_brain_item_id,1,btrim(v_payload->>'title'),btrim(v_payload->>'content'),nullif(btrim(coalesce(v_payload->>'summary','')),''),v_topics,nullif(btrim(coalesce(v_payload->>'change_note','')),''),p_created_by);
    insert into public.teaching_items (source_id,brain_item_id,created_by) values (v_extraction.source_id,v_brain_item_id,p_created_by) returning id into v_teaching_item_id;
    insert into public.teaching_versions (teaching_item_id,brain_item_id,version_number,source_locator,created_by) values (v_teaching_item_id,v_brain_item_id,1,jsonb_build_object('kind','document_candidate','document_upload_id',v_extraction.document_upload_id,'document_teaching_extraction_id',v_extraction.id,'document_teaching_candidate_id',v_candidate.id,'candidate_ordinal',v_candidate.ordinal,'source_excerpt',v_candidate.source_excerpt,'source_locator',v_candidate.source_locator),p_created_by);
    insert into public.document_teaching_candidate_drafts (candidate_id,brain_item_id,created_by) values (v_candidate.id,v_brain_item_id,p_created_by);
    v_results := v_results || jsonb_build_array(jsonb_build_object('candidate_id',v_candidate.id,'brain_item_id',v_brain_item_id,'version_number',1));
  end loop;
  return v_results;
end;
$$;

revoke execute on function public.claim_document_teaching_extraction(uuid,uuid,text,integer,integer) from public, anon, authenticated;
revoke execute on function public.complete_document_teaching_extraction(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.fail_document_teaching_extraction(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.create_document_teaching_drafts(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.claim_document_teaching_extraction(uuid,uuid,text,integer,integer) to service_role;
grant execute on function public.complete_document_teaching_extraction(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.fail_document_teaching_extraction(uuid,uuid,uuid,text) to service_role;
grant execute on function public.create_document_teaching_drafts(uuid,uuid,jsonb) to service_role;
revoke all on function public.prevent_document_teaching_candidate_mutation() from public, anon, authenticated, service_role;
revoke all on function public.prevent_completed_document_teaching_extraction_mutation() from public, anon, authenticated, service_role;
