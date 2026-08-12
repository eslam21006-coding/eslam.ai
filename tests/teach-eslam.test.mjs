import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

function validValues(overrides = {}) {
  return {
    title: "Diagnose the first broken step",
    content: "Fix the earliest broken step before optimizing downstream symptoms.",
    summary: "Core diagnostic principle",
    topics: "diagnosis, funnel, Diagnosis",
    change_note: "Initial teaching",
    semantic_layer: "brain",
    item_type: "principle",
    priority: "25",
    ...overrides,
  };
}

test("Teach Eslam validates canonical Brain fields and normalizes topics", async () => {
  const { validateTeachEslamDraft } = await importSource(
    "src/features/teach-eslam/core.ts",
  );

  const result = validateTeachEslamDraft(validValues());
  assert.equal(result.ok, true);
  assert.equal(result.draft.priority, 25);
  assert.deepEqual(result.draft.topics, ["diagnosis", "funnel"]);
  assert.equal(result.draft.semantic_layer, "brain");
  assert.equal(result.draft.item_type, "principle");
});

test("Teach Eslam rejects invalid enums, lengths, topics, and priority", async () => {
  const { validateTeachEslamDraft, TEACH_ESLAM_LIMITS } = await importSource(
    "src/features/teach-eslam/core.ts",
  );

  const invalid = [
    validValues({ title: "" }),
    validValues({ content: "" }),
    validValues({ semantic_layer: "metrics" }),
    validValues({ item_type: "random" }),
    validValues({ priority: "1.5" }),
    validValues({ priority: "1001" }),
    validValues({ title: "x".repeat(TEACH_ESLAM_LIMITS.title + 1) }),
    validValues({ content: "x".repeat(TEACH_ESLAM_LIMITS.content + 1) }),
    validValues({ summary: "x".repeat(TEACH_ESLAM_LIMITS.summary + 1) }),
    validValues({ change_note: "x".repeat(TEACH_ESLAM_LIMITS.changeNote + 1) }),
    validValues({ topics: Array.from({ length: 13 }, (_, i) => `topic-${i}`).join(",") }),
    validValues({ topics: "x".repeat(TEACH_ESLAM_LIMITS.topic + 1) }),
  ];

  for (const values of invalid) {
    assert.equal(validateTeachEslamDraft(values).ok, false);
  }
});

test("Teach Eslam is a protected server-only Brain authoring flow", () => {
  const actions = readSource("src/features/teach-eslam/actions.ts");
  const form = readSource("src/features/teach-eslam/teach-eslam-form.tsx");
  const page = readSource("src/app/admin/teach/page.tsx");
  const navigation = readSource("src/features/admin-shell/navigation.ts");

  assert.match(actions, /^"use server";/);
  assert.match(actions, /requireAdmin\(\)/g);
  assert.match(actions, /getSupabaseAdminClient\(\)/);
  assert.match(actions, /create_eslam_brain_draft/);
  assert.match(actions, /status: "published", published_version_number: versionNumber/);
  assert.match(actions, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(actions, /\.eq\("status", "draft"\)/);
  assert.doesNotMatch(form, /service_role|SUPABASE_SERVICE_ROLE|createClient\(/i);
  assert.match(page, />\s*Teach Eslam\s*</);
  assert.match(navigation, /label: "Teach Eslam"/);
});

test("Teach Eslam draft RPC is transactional and client-inaccessible", () => {
  const migration = readSource(
    "supabase/migrations/20260812090519_create_teach_eslam_draft_function.sql",
  );
  const runtime = readSource("supabase/tests/teach_eslam_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(migration, /create or replace function public\.create_eslam_brain_draft\(p_payload jsonb\)/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /insert into public\.eslam_brain_items/);
  assert.match(migration, /insert into public\.eslam_brain_versions/);
  assert.match(migration, /'draft'/);
  assert.match(migration, /version_number,[\s\S]*1,/);
  assert.match(
    migration,
    /revoke execute on function public\.create_eslam_brain_draft\(jsonb\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(runtime, /failed version insert left a partial Brain item behind/);
  assert.match(runtime, /published_version_number = 1/);
  assert.match(ci, /supabase\/tests\/teach_eslam_runtime\.sql/);
});

test("Task 15 remains text-authoring only", () => {
  const sources = [
    readSource("src/features/teach-eslam/core.ts"),
    readSource("src/features/teach-eslam/actions.ts"),
    readSource("src/features/teach-eslam/teach-eslam-form.tsx"),
    readSource("src/app/admin/teach/page.tsx"),
  ].join("\n");

  assert.doesNotMatch(
    sources,
    /file_search|vector_store|voice|transcrib|document_ingestion|teaching_sources|bulk approve|mentee_memor|metric_snapshots/i,
  );
});
