create index eslam_brain_items_created_by_idx
  on public.eslam_brain_items (created_by)
  where created_by is not null;

create index eslam_brain_items_published_version_fk_idx
  on public.eslam_brain_items (id, published_version_number)
  where published_version_number is not null;

create index eslam_brain_versions_created_by_idx
  on public.eslam_brain_versions (created_by)
  where created_by is not null;
