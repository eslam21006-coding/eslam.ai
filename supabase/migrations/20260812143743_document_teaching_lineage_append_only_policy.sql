comment on table public.teaching_sources is
  'Append-only provenance. Hard deletion is unsupported; service_role has no DELETE privilege.';

comment on table public.teaching_items is
  'Append-only teaching-to-source lineage. Hard deletion is unsupported; service_role has no DELETE privilege.';

comment on table public.teaching_versions is
  'Append-only version provenance linked to immutable Brain versions. Hard deletion is unsupported; service_role has no DELETE privilege.';
