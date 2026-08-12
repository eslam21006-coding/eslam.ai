alter table public.eslam_brain_versions
  drop constraint eslam_brain_versions_created_by_fkey;

drop index public.eslam_brain_versions_created_by_idx;

revoke all on table public.eslam_brain_items from service_role;
grant select on table public.eslam_brain_items to service_role;
grant insert (
  semantic_layer,
  item_type,
  status,
  priority,
  published_version_number,
  created_by
) on public.eslam_brain_items to service_role;
grant update (
  semantic_layer,
  item_type,
  status,
  priority,
  published_version_number
) on public.eslam_brain_items to service_role;

revoke all on table public.eslam_brain_versions from service_role;
grant select on table public.eslam_brain_versions to service_role;
grant insert (
  item_id,
  version_number,
  title,
  content,
  summary,
  topics,
  change_note,
  created_by
) on public.eslam_brain_versions to service_role;
