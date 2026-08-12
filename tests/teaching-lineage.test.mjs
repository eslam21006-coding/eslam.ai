import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const migrationPath =
  "supabase/migrations/20260812141640_create_teaching_lineage.sql";
const multiSourceMigrationPath =
  "supabase/migrations/20260812143639_support_multi_source_teaching_lineage.sql";
const deletionPolicyMigrationPath =
  "supabase/migrations/20260812143743_document_teaching_lineage_append_only_policy.sql";

test("Task 16 adds canonical source, teaching, and version lineage tables", () => {
  const migration = readSource(migrationPath);
  const types = readSource("src/types/database.ts");

  assert.match(migration, /create table public\.teaching_sources/);
  assert.match(migration, /create table public\.teaching_items/);
  assert.match(migration, /create table public\.teaching_versions/);
  assert.match(migration, /source_type in \('manual_text', 'voice', 'document'\)/);
  assert.match(migration, /teaching_versions_brain_version_fk/);
  assert.match(migration, /references public\.eslam_brain_versions\(item_id, version_number\)/);

  assert.match(types, /teaching_sources:/);
  assert.match(types, /teaching_items:/);
  assert.match(types, /teaching_versions:/);
  assert.match(types, /foreignKeyName: "teaching_versions_brain_version_fk"/);
  assert.match(types, /foreignKeyName: "teaching_versions_teaching_item_brain_item_fk"/);
});

test("Task 16 allows a Brain item and version to receive provenance from multiple sources", () => {
  const migration = readSource(multiSourceMigrationPath);
  const runtime = readSource("supabase/tests/teaching_lineage_runtime.sql");
  const types = readSource("src/types/database.ts");

  assert.match(migration, /drop constraint teaching_items_brain_item_id_key/);
  assert.match(migration, /create index teaching_items_brain_item_id_idx/);
  assert.match(migration, /source_type in \('manual_text', 'voice', 'document', 'legacy'\)/);
  assert.match(runtime, /'voice'/);
  assert.match(runtime, /secondary_source_contribution/);
  assert.match(runtime, /Brain item could not receive provenance from multiple sources/);
  assert.match(
    types,
    /foreignKeyName: "teaching_items_brain_item_id_fkey"[\s\S]*?isOneToOne: false/,
  );
});

test("Task 16 represents pre-lineage Brain rows with explicit legacy provenance", () => {
  const migration = readSource(multiSourceMigrationPath);

  assert.match(migration, /where not exists[\s\S]*public\.teaching_items/);
  assert.match(migration, /'legacy'/);
  assert.match(migration, /'entrypoint', 'pre_lineage_backfill'/);
  assert.match(migration, /'capture_mode', 'legacy'/);
  assert.match(migration, /insert into public\.teaching_items/);
  assert.match(migration, /insert into public\.teaching_versions/);
  assert.match(migration, /'kind', 'legacy_brain_version'/);
  assert.match(migration, /from public\.eslam_brain_versions v/);
});

test("Task 16 keeps global teaching lineage server-only and immutable", () => {
  const migration = readSource(migrationPath);
  const deletionPolicy = readSource(deletionPolicyMigrationPath);
  const runtime = readSource("supabase/tests/teaching_lineage_runtime.sql");

  for (const table of ["teaching_sources", "teaching_items", "teaching_versions"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`),
    );
    assert.match(runtime, new RegExp(`['\"]${table}['\"]`));
  }

  assert.match(migration, /create or replace function public\.prevent_teaching_lineage_mutation\(\)/);
  assert.match(migration, /teaching lineage records are immutable/);
  assert.match(migration, /prevent_teaching_source_update/);
  assert.match(migration, /prevent_teaching_item_update/);
  assert.match(migration, /prevent_teaching_version_delete/);
  assert.match(deletionPolicy, /Append-only provenance/);
  assert.match(deletionPolicy, /Hard deletion is unsupported; service_role has no DELETE privilege/);
  assert.match(runtime, /service_role unexpectedly can mutate immutable teaching lineage/);
  assert.match(runtime, /append-only teaching lineage deletion policy is not documented/);
  assert.match(runtime, /when sqlstate '55000'/);
});

test("Teach Eslam now creates manual source lineage in the same draft transaction", () => {
  const migration = readSource(migrationPath);
  const runtime = readSource("supabase/tests/teaching_lineage_runtime.sql");

  assert.match(
    migration,
    /create or replace function public\.create_eslam_brain_draft\(p_payload jsonb\)/,
  );
  assert.match(migration, /security invoker/);
  assert.match(migration, /insert into public\.teaching_sources/);
  assert.match(migration, /'manual_text'/);
  assert.match(migration, /'entrypoint', 'teach_eslam'/);
  assert.match(migration, /insert into public\.eslam_brain_items/);
  assert.match(migration, /insert into public\.eslam_brain_versions/);
  assert.match(migration, /insert into public\.teaching_items/);
  assert.match(migration, /insert into public\.teaching_versions/);
  assert.match(migration, /'kind', 'manual_entry'/);
  assert.match(
    migration,
    /revoke execute on function public\.create_eslam_brain_draft\(jsonb\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_eslam_brain_draft\(jsonb\)\s*to service_role/,
  );

  assert.match(runtime, /client role unexpectedly can execute create_eslam_brain_draft/);
  assert.match(runtime, /service_role is missing execute on create_eslam_brain_draft/);
  assert.match(runtime, /Teach Eslam did not create complete source-to-Brain lineage/);
  assert.match(runtime, /failed Teach Eslam transaction left partial teaching lineage behind/);
});

test("Task 16 CI executes teaching lineage runtime coverage", () => {
  const ci = readSource(".github/workflows/ci.yml");
  const runtime = readSource("supabase/tests/teaching_lineage_runtime.sql");

  assert.match(ci, /supabase\/tests\/teaching_lineage_runtime\.sql/);
  assert.match(runtime, /has_table_privilege\('anon'/);
  assert.match(runtime, /has_table_privilege\('authenticated'/);
  assert.match(runtime, /has_table_privilege\('service_role'/);
  assert.match(runtime, /has_function_privilege\('anon'/);
  assert.match(runtime, /has_function_privilege\('authenticated'/);
  assert.match(runtime, /has_function_privilege\('service_role'/);
  assert.match(runtime, /source_metadata ->> 'entrypoint' = 'teach_eslam'/);
  assert.match(runtime, /source_locator ->> 'kind' = 'manual_entry'/);
});

test("Task 16 does not implement later ingestion or RAG workflows", () => {
  const sources = [
    readSource(migrationPath),
    readSource(multiSourceMigrationPath),
    readSource(deletionPolicyMigrationPath),
    readSource("supabase/tests/teaching_lineage_runtime.sql"),
  ].join("\n");

  assert.doesNotMatch(
    sources,
    /vector_store|file_search|embedding|transcription|mediaRecorder|audio_blob|document_extract|review_queue|bulk_approve|mentee_memor|metric_snapshots/i,
  );
});
