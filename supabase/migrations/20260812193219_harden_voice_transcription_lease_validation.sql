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
  if p_lease_seconds is null or p_lease_seconds not between 60 and 1800 then
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

revoke all on function public.claim_voice_transcription(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_voice_transcription(uuid, uuid, text, integer) to service_role;
