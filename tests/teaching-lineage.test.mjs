import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const migrationPath =
  "supabase/migrations/20260812141640_create_teaching_lineage.sql";

test("Task 16 adds canonical source, teaching, and version lineage tables", () => {
  const migration = readSource(migrationPath);
  const types = readSource("src/types/database.ts");

  assert.match(migration, /create table public\.teaching_sources/);
  assert.match(migration, /create table public\.teaching_items/);
  assert.match(migration, /create table public\.teaching_versions/);
  assert.match(migration, /source_type in \('manual_text', 'voice', 'document'\)/);
  assert.match(migration, /brain_item_id uuid not null unique references public\.eslam_brain_items/);
  assert.match(migration, /teaching_versions_brain_version_fk/);
  assert.match(migration, /references public\.eslam_brain_versions\(item_id, version_number\)/);

  assert.match(types, /teaching_sources:/);
  assert.match(types, /teaching_items:/);
  assert.match(types, /teaching_versions:/);
  assert.match(types, /foreignKeyName: "teaching_versions_brain_version_fk"/);
  assert.match(types, /foreignKeyName: "teaching_versions_teaching_item_brain_item_fk"/);
});

test("Task 16 keeps global teaching lineage server-only and immutable", () => {
  const migration = readSource(migrationPath);
  const runtime = readSource("supabase/tests/teaching_lineage_runtime.sql");

  for (const table of ["teaching_sources", "teaching_items", "teaching_versions"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`),
    );
    assert.match(
      runtime,
      new RegExp(`['\"]${table}['\"]`),
    );
  }

  assert.match(migration, /create or replace function public\.prevent_teaching_lineage_mutation\(\)/);
  assert.match(migration, /teaching lineage records are immutable/);
  assert.match(migration, /prevent_teaching_source_update/);
  assert.match(migration, /prevent_teaching_item_update/);
  assert.match(migration, /prevent_teaching_version_delete/);
  assert.match(runtime, /service_role unexpectedly can mutate immutable teaching lineage/);
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
  assert.match(migration, /grant execute[\s\S]*to service_role/);

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
  assert.match(runtime, /source_metadata ->> 'entrypoint' = 'teach_eslam'/);
  assert.match(runtime, /source_locator ->> 'kind' = 'manual_entry'/);
});

test("Task 16 does not implement later ingestion or RAG workflows", () => {
  const migration = readSource(migrationPath);
  const runtime = readSource("supabase/tests/teaching_lineage_runtime.sql");
  const combined = `${migration}\n${runtime}`;

  assert.doesNotMatch(
    combined,
    /vector_store|file_search|embedding|transcription|mediaRecorder|audio_blob|document_extract|review_queue|bulk_approve|mentee_memor|metric_snapshots/i,
  );
});
