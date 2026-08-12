# Teaching lineage retention policy

Eslam.AI treats published Brain history and teaching provenance as append-only records.

- `eslam_brain_versions` are immutable historical versions.
- `teaching_sources`, `teaching_items`, and `teaching_versions` are immutable provenance records.
- Hard deletion of Brain versions or teaching lineage is unsupported.
- `service_role` intentionally has no `DELETE` privilege on teaching lineage tables.
- A teaching that should stop affecting coaching must be removed from active use through the Brain lifecycle (for example, `archived`) rather than by deleting its historical version or provenance.
- Future voice and document ingestion must add new source/version lineage; it must not rewrite or delete prior provenance.

This retention rule preserves an auditable chain from every source contribution to the exact Brain version it informed.
