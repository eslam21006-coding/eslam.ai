create or replace function public.claim_document_teaching_extraction(
  p_document_id uuid,
  p_created_by uuid,
  p_model text,
  p_prompt_version integer default 1,
  p_lease_seconds integer default 180
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

  select * into v_document
  from public.document_teaching_uploads
  where id = p_document_id
    and created_by = p_created_by
    and status = 'uploaded'
    and source_id is not null
  for share;

  if not found then
    return query select null::uuid, 'not_found'::text, 0, null::uuid;
    return;
  end if;

  select * into v_extraction
  from public.document_teaching_extractions
  where document_upload_id = p_document_id
    and created_by = p_created_by
  for update;

  if not found then
    insert into public.document_teaching_extractions (
      document_upload_id, source_id, created_by, status, model, prompt_version,
      attempt_count, claim_token, lease_expires_at, processing_started_at
    ) values (
      p_document_id, v_document.source_id, p_created_by, 'processing', btrim(p_model), p_prompt_version,
      1, v_token, v_now + make_interval(secs => p_lease_seconds), v_now
    )
    returning * into v_extraction;

    return query select v_extraction.id, 'claimed'::text, v_extraction.attempt_count, v_extraction.claim_token;
    return;
  end if;

  if v_extraction.status = 'completed' then
    return query select v_extraction.id, 'completed'::text, v_extraction.attempt_count, null::uuid;
    return;
  end if;

  if v_extraction.status = 'processing' and v_extraction.lease_expires_at > v_now then
    return query select v_extraction.id, 'busy'::text, v_extraction.attempt_count, null::uuid;
    return;
  end if;

  update public.document_teaching_extractions as dte
  set status = 'processing',
      model = btrim(p_model),
      prompt_version = p_prompt_version,
      attempt_count = dte.attempt_count + 1,
      claim_token = v_token,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      processing_started_at = v_now,
      completed_at = null,
      last_error_code = null,
      last_error_at = null,
      updated_at = v_now
  where dte.id = v_extraction.id
  returning dte.* into v_extraction;

  return query select v_extraction.id, 'claimed'::text, v_extraction.attempt_count, v_extraction.claim_token;
end;
$$;

revoke execute on function public.claim_document_teaching_extraction(uuid,uuid,text,integer,integer)
from public, anon, authenticated;
grant execute on function public.claim_document_teaching_extraction(uuid,uuid,text,integer,integer)
to service_role;
