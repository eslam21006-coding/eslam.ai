create or replace function public.prevent_document_teaching_extraction_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'document teaching extraction audit records are immutable' using errcode = '55000';
end;
$$;

drop trigger if exists prevent_document_teaching_extraction_delete
on public.document_teaching_extractions;

create trigger prevent_document_teaching_extraction_delete
before delete on public.document_teaching_extractions
for each row
execute function public.prevent_document_teaching_extraction_delete();

revoke all on function public.prevent_document_teaching_extraction_delete()
from public, anon, authenticated, service_role;
