create table public.voice_transcriptions (
  id uuid primary key default gen_random_uuid(),
  voice_recording_id uuid not null unique references public.voice_recordings(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null,
  model text not null,
  transcript_text text,
  attempt_count integer not null default 1,
  processing_started_at timestamptz,
  lease_expires_at timestamptz,
  claim_token uuid,
  completed_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint voice_transcriptions_status_check
    check (status in ('processing', 'completed', 'failed')),
  constraint voice_transcriptions_model_check
    check (char_length(btrim(model)) between 1 and 120),
  constraint voice_transcriptions_text_check
    check (transcript_text is null or char_length(transcript_text) between 1 and 250000),
  constraint voice_transcriptions_attempt_count_check
    check (attempt_count between 1 and 1000),
  constraint voice_transcriptions_error_code_check
    check (last_error_code is null or char_length(last_error_code) between 1 and 120),
  constraint voice_transcriptions_state_check
    check (
      (
        status = 'processing'
        and transcript_text is null
        and processing_started_at is not null
        and lease_expires_at is not null
        and claim_token is not null
        and completed_at is null
        and last_error_code is null
        and last_error_at is null
      )
      or
      (
        status = 'completed'
        and transcript_text is not null
        and char_length(btrim(transcript_text)) > 0
        and processing_started_at is not null
        and lease_expires_at is null
        and claim_token is null
        and completed_at is not null
        and last_error_code is null
        and last_error_at is null
      )
      or
      (
        status = 'failed'
        and transcript_text is null
        and processing_started_at is not null
        and lease_expires_at is null
        and claim_token is null
        and completed_at is null
        and last_error_code is not null
        and last_error_at is not null
      )
    )
);

create index voice_transcriptions_owner_created_idx
  on public.voice_transcriptions (created_by, created_at desc);

create index voice_transcriptions_owner_status_lease_idx
  on public.voice_transcriptions (created_by, status, lease_expires_at);

alter table public.voice_transcriptions enable row level security;

revoke all on table public.voice_transcriptions from public, anon, authenticated;
grant select, insert, update on table public.voice_transcriptions to service_role;

create policy "voice transcriptions deny anon select"
  on public.voice_transcriptions for select to anon using (false);
create policy "voice transcriptions deny authenticated select"
  on public.voice_transcriptions for select to authenticated using (false);
create policy "voice transcriptions deny anon insert"
  on public.voice_transcriptions for insert to anon with check (false);
create policy "voice transcriptions deny authenticated insert"
  on public.voice_transcriptions for insert to authenticated with check (false);
create policy "voice transcriptions deny anon update"
  on public.voice_transcriptions for update to anon using (false) with check (false);
create policy "voice transcriptions deny authenticated update"
  on public.voice_transcriptions for update to authenticated using (false) with check (false);

comment on table public.voice_transcriptions is
  'Admin-only derived speech-to-text artifacts for private voice recordings. Completed transcript text is immutable and is not a Brain teaching.';
comment on column public.voice_transcriptions.claim_token is
  'Rotating attempt fence. Only the worker holding the current token may complete or fail the processing attempt.';
comment on column public.voice_transcriptions.lease_expires_at is
  'Allows a failed or abandoned processing attempt to be reclaimed without permitting an older worker to overwrite a newer claim.';

create or replace function public.prevent_completed_voice_transcription_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed' and new is distinct from old then
    raise exception 'completed voice transcriptions are immutable';
  end if;
  return new;
end;
$$;

create trigger prevent_completed_voice_transcription_mutation
before update on public.voice_transcriptions
for each row execute function public.prevent_completed_voice_transcription_mutation();

create or replace function public.claim_voice_transcription(
  p_recording_id uuid,
  p_created_by uuid,
  p_model text,
  p_lease_seconds integer default 300
)
returns table (
  transcription_id uuid,
  claim_state text,
  attempt_count integer,
  claim_token uuid,
  transcript_text text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_lease_expires_at timestamptz;
  v_claim_token uuid := gen_random_uuid();
  v_row public.voice_transcriptions%rowtype;
begin
  if p_recording_id is null or p_created_by is null then
    raise exception 'recording and creator are required';
  end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 120 then
    raise exception 'invalid transcription model';
  end if;
  if p_lease_seconds not between 60 and 1800 then
    raise exception 'invalid transcription lease';
  end if;

  if not exists (
    select 1
    from public.voice_recordings vr
    where vr.id = p_recording_id
      and vr.created_by = p_created_by
      and vr.status = 'uploaded'
  ) then
    return query select null::uuid, 'not_found'::text, 0, null::uuid, null::text;
    return;
  end if;

  v_lease_expires_at := v_now + make_interval(secs => p_lease_seconds);

  insert into public.voice_transcriptions (
    voice_recording_id,
    created_by,
    status,
    model,
    attempt_count,
    processing_started_at,
    lease_expires_at,
    claim_token,
    created_at,
    updated_at
  )
  values (
    p_recording_id,
    p_created_by,
    'processing',
    btrim(p_model),
    1,
    v_now,
    v_lease_expires_at,
    v_claim_token,
    v_now,
    v_now
  )
  on conflict (voice_recording_id) do update
  set status = 'processing',
      model = excluded.model,
      transcript_text = null,
      attempt_count = public.voice_transcriptions.attempt_count + 1,
      processing_started_at = v_now,
      lease_expires_at = v_lease_expires_at,
      claim_token = v_claim_token,
      completed_at = null,
      last_error_code = null,
      last_error_at = null,
      updated_at = v_now
  where public.voice_transcriptions.created_by = p_created_by
    and (
      public.voice_transcriptions.status = 'failed'
      or (
        public.voice_transcriptions.status = 'processing'
        and public.voice_transcriptions.lease_expires_at <= v_now
      )
    )
  returning * into v_row;

  if found then
    return query
      select v_row.id, 'claimed'::text, v_row.attempt_count, v_row.claim_token, null::text;
    return;
  end if;

  select * into v_row
  from public.voice_transcriptions vt
  where vt.voice_recording_id = p_recording_id
    and vt.created_by = p_created_by;

  if not found then
    return query select null::uuid, 'not_found'::text, 0, null::uuid, null::text;
  elsif v_row.status = 'completed' then
    return query
      select v_row.id, 'completed'::text, v_row.attempt_count, null::uuid, v_row.transcript_text;
  else
    return query
      select v_row.id, 'busy'::text, v_row.attempt_count, null::uuid, null::text;
  end if;
end;
$$;

create or replace function public.complete_voice_transcription(
  p_transcription_id uuid,
  p_created_by uuid,
  p_claim_token uuid,
  p_transcript_text text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_transcript_text is null
     or char_length(btrim(p_transcript_text)) = 0
     or char_length(p_transcript_text) > 250000 then
    raise exception 'invalid transcript text';
  end if;

  update public.voice_transcriptions
  set status = 'completed',
      transcript_text = p_transcript_text,
      lease_expires_at = null,
      claim_token = null,
      completed_at = timezone('utc', now()),
      last_error_code = null,
      last_error_at = null,
      updated_at = timezone('utc', now())
  where id = p_transcription_id
    and created_by = p_created_by
    and status = 'processing'
    and claim_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.fail_voice_transcription(
  p_transcription_id uuid,
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
    raise exception 'invalid transcription error code';
  end if;

  update public.voice_transcriptions
  set status = 'failed',
      transcript_text = null,
      lease_expires_at = null,
      claim_token = null,
      completed_at = null,
      last_error_code = btrim(p_error_code),
      last_error_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_transcription_id
    and created_by = p_created_by
    and status = 'processing'
    and claim_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.claim_voice_transcription(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.complete_voice_transcription(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_voice_transcription(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_voice_transcription(uuid, uuid, text, integer) to service_role;
grant execute on function public.complete_voice_transcription(uuid, uuid, uuid, text) to service_role;
grant execute on function public.fail_voice_transcription(uuid, uuid, uuid, text) to service_role;

revoke all on function public.prevent_completed_voice_transcription_mutation() from public, anon, authenticated;
grant execute on function public.prevent_completed_voice_transcription_mutation() to service_role;
