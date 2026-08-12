import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const schemaMigration = readSource(
  "supabase/migrations/20260812060822_create_eslam_brain_data_model.sql",
);
const indexMigration = readSource(
  "supabase/migrations/20260812060949_index_eslam_brain_foreign_keys.sql",
);
const hardeningMigration = readSource(
  "supabase/migrations/20260812061925_harden_eslam_brain_provenance_privileges.sql",
);

test("Eslam Brain canonical model enforces semantic layers, teaching types, and lifecycle", () => {
  assert.match(schemaMigration, /create table public\.eslam_brain_items/);
  assert.match(schemaMigration, /'identity', 'brain', 'cases', 'voice'/);
  assert.match(
    schemaMigration,
    /'identity_fact'[\s\S]*'principle'[\s\S]*'diagnostic_rule'[\s\S]*'framework'[\s\S]*'hard_rule'[\s\S]*'example'[\s\S]*'correction'[\s\S]*'contraindication'[\s\S]*'voice_rule'/,
  );
  assert.match(schemaMigration, /'draft', 'approved', 'published', 'archived'/);
  assert.match(schemaMigration, /priority between 0 and 1000/);
  assert.match(schemaMigration, /status <> 'published' or published_version_number is not null/);
  assert.doesNotMatch(schemaMigration, /'knowledge'/);
});

test("Eslam Brain versions are immutable and published pointers reference real versions", () => {
  assert.match(schemaMigration, /create table public\.eslam_brain_versions/);
  assert.match(schemaMigration, /unique \(item_id, version_number\)/);
  assert.match(schemaMigration, /eslam_brain_items_published_version_fk/);
  assert.match(
    schemaMigration,
    /references public\.eslam_brain_versions\(item_id, version_number\)/,
  );
  assert.match(schemaMigration, /prevent_eslam_brain_version_update/);
  assert.match(schemaMigration, /prevent_eslam_brain_version_delete/);
  assert.match(schemaMigration, /eslam brain versions are immutable/);
  assert.match(schemaMigration, /char_length\(btrim\(content\)\) between 1 and 16000/);
});

test("final Brain privileges are server-only and column-scoped", () => {
  assert.match(
    schemaMigration,
    /revoke all on table public\.eslam_brain_items from public, anon, authenticated, service_role/,
  );
  assert.match(
    schemaMigration,
    /revoke all on table public\.eslam_brain_versions from public, anon, authenticated, service_role/,
  );
  assert.match(hardeningMigration, /revoke all on table public\.eslam_brain_items from service_role/);
  assert.match(hardeningMigration, /grant select on table public\.eslam_brain_items to service_role/);
  assert.match(
    hardeningMigration,
    /grant insert \([\s\S]*semantic_layer[\s\S]*created_by[\s\S]*\) on public\.eslam_brain_items to service_role/,
  );
  assert.match(
    hardeningMigration,
    /grant update \([\s\S]*semantic_layer[\s\S]*published_version_number[\s\S]*\) on public\.eslam_brain_items to service_role/,
  );
  assert.match(hardeningMigration, /grant select on table public\.eslam_brain_versions to service_role/);
  assert.match(
    hardeningMigration,
    /grant insert \([\s\S]*item_id[\s\S]*content[\s\S]*created_by[\s\S]*\) on public\.eslam_brain_versions to service_role/,
  );
  assert.doesNotMatch(hardeningMigration, /grant update .*eslam_brain_versions/i);
  assert.doesNotMatch(hardeningMigration, /grant delete .*eslam_brain/i);
  assert.match(schemaMigration, /alter table public\.eslam_brain_items enable row level security/);
  assert.match(schemaMigration, /alter table public\.eslam_brain_versions enable row level security/);
});

test("immutable version provenance survives Auth-user deletion", () => {
  assert.match(schemaMigration, /created_by uuid references auth\.users\(id\) on delete set null/);
  assert.match(hardeningMigration, /drop constraint eslam_brain_versions_created_by_fkey/);
  assert.match(hardeningMigration, /drop index public\.eslam_brain_versions_created_by_idx/);
});

test("Eslam Brain foreign keys and published retrieval have covering indexes", () => {
  assert.match(schemaMigration, /eslam_brain_items_published_lookup_idx/);
  assert.match(schemaMigration, /where status = 'published'/);
  assert.match(schemaMigration, /eslam_brain_versions_item_created_idx/);
  assert.match(indexMigration, /eslam_brain_items_created_by_idx/);
  assert.match(indexMigration, /eslam_brain_items_published_version_fk_idx/);
  assert.match(indexMigration, /eslam_brain_versions_created_by_idx/);
});

test("runtime database regression executes the final immutable server-only brain contract in CI", () => {
  const runtime = readSource("supabase/tests/eslam_brain_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(runtime, /client role unexpectedly has direct Eslam Brain access/);
  assert.match(runtime, /service_role item table privileges do not match the column-scoped contract/);
  assert.match(runtime, /service_role item column privileges do not match the Task 13 contract/);
  assert.match(runtime, /service_role version table privileges do not match the immutable history contract/);
  assert.match(runtime, /service_role version insert columns do not match the immutable history contract/);
  assert.match(runtime, /published Eslam Brain item did not resolve deterministically/);
  assert.match(runtime, /nonexistent published version unexpectedly succeeded/);
  assert.match(runtime, /immutable brain version trigger did not reject UPDATE/);
  assert.match(runtime, /immutable brain version trigger did not reject DELETE/);
  assert.match(runtime, /immutable version creator provenance was not preserved after Auth user deletion/);
  assert.match(ci, /supabase\/tests\/eslam_brain_runtime\.sql/);
});

test("generated Supabase types include canonical brain items and version history", () => {
  const databaseTypes = readSource("src/types/database.ts");

  assert.match(databaseTypes, /eslam_brain_items: \{/);
  assert.match(databaseTypes, /published_version_number: number \| null/);
  assert.match(databaseTypes, /semantic_layer: string/);
  assert.match(databaseTypes, /eslam_brain_versions: \{/);
  assert.match(databaseTypes, /version_number: number/);
  assert.match(databaseTypes, /topics: string\[\]/);
  assert.match(databaseTypes, /foreignKeyName: "eslam_brain_items_published_version_fk"/);
  assert.match(databaseTypes, /foreignKeyName: "eslam_brain_versions_item_id_fkey"/);
});

test("Task 13 remains persistence-only while Task 14 owns Brain retrieval", () => {
  const retrieval = readSource("src/features/eslam-brain/model-context-data.ts");

  assert.doesNotMatch(
    schemaMigration + indexMigration + hardeningMigration,
    /OpenAI|responses\.create|assistant-request|chat\/stream/i,
  );
  assert.match(retrieval, /from\("eslam_brain_items"\)/);
  assert.match(retrieval, /\.eq\("status", "published"\)/);
});
