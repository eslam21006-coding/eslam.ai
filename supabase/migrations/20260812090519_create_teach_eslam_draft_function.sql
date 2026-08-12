create or replace function public.create_eslam_brain_draft(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_item_id uuid;
  created_by_id uuid;
  normalized_topics text[];
begin
  created_by_id := nullif(p_payload ->> 'created_by', '')::uuid;
  normalized_topics := array(
    select jsonb_array_elements_text(coalesce(p_payload -> 'topics', '[]'::jsonb))
  );

  insert into public.eslam_brain_items (
    semantic_layer,
    item_type,
    status,
    priority,
    created_by
  ) values (
    p_payload ->> 'semantic_layer',
    p_payload ->> 'item_type',
    'draft',
    (p_payload ->> 'priority')::smallint,
    created_by_id
  )
  returning id into new_item_id;

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
    new_item_id,
    1,
    p_payload ->> 'title',
    p_payload ->> 'content',
    nullif(p_payload ->> 'summary', ''),
    normalized_topics,
    nullif(p_payload ->> 'change_note', ''),
    created_by_id
  );

  return new_item_id;
end;
$$;

revoke execute on function public.create_eslam_brain_draft(jsonb)
from public, anon, authenticated;

grant execute on function public.create_eslam_brain_draft(jsonb)
to service_role;
