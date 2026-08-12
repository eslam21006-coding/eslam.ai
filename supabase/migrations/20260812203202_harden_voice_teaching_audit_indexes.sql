drop index if exists public.voice_teaching_candidates_extraction_idx;
drop index if exists public.voice_teaching_candidate_drafts_brain_item_idx;

create or replace function public.prevent_completed_voice_teaching_extraction_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed' then
    raise exception 'completed voice teaching extractions are immutable' using errcode = '55000';
  end if;
  return old;
end;
$$;

create trigger prevent_completed_voice_teaching_extraction_delete
before delete on public.voice_teaching_extractions
for each row execute function public.prevent_completed_voice_teaching_extraction_delete();

revoke all on function public.prevent_completed_voice_teaching_extraction_delete()
  from public, anon, authenticated;
grant execute on function public.prevent_completed_voice_teaching_extraction_delete()
  to service_role;
