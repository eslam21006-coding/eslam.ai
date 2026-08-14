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

  const casing = validateTeachEslamDraft(
    validValues({ topics: "SEO, seo, B2B, b2b, Funnel" }),
  );
  assert.equal(casing.ok, true);
  assert.deepEqual(casing.draft.topics, ["SEO", "B2B", "Funnel"]);
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
    validValues({ priority: "" }),
    validValues({ priority: "   " }),
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

test("training hub routes each teaching method into a dedicated workflow", () => {
  const hub = readSource("src/app/admin/teach/page.tsx");

  assert.match(hub, /تدريب إسلام/);
  assert.match(hub, /href: "\/admin\/teach\/text"/);
  assert.match(hub, /href: "\/admin\/teach\/voice"/);
  assert.match(hub, /href: "\/admin\/teach\/documents"/);
  assert.match(hub, /href="\/admin\/brain\?status=draft&page=1"/);
  assert.doesNotMatch(hub, /<TeachEslamForm/);
});

test("Teach Eslam text authoring is a protected server-only Brain flow", () => {
  const actions = readSource("src/features/teach-eslam/actions.ts");
  const data = readSource("src/features/teach-eslam/data.ts");
  const form = readSource("src/features/teach-eslam/teach-eslam-form.tsx");
  const page = readSource("src/app/admin/teach/text/page.tsx");
  const navigation = readSource("src/features/admin-shell/navigation.ts");

  assert.match(actions, /^"use server";/);
  assert.match(actions, /requireAdmin\(\)/g);
  assert.match(actions, /getSupabaseAdminClient\(\)/);
  assert.match(actions, /create_eslam_brain_draft/);
  assert.match(actions, /publish_eslam_brain_draft_direct/);
  assert.match(actions, /TEACH_ESLAM_TEXT_PATH = "\/admin\/teach\/text"/);
  assert.match(actions, /p_created_by: authorization\.userId/);
  assert.match(actions, /p_version_number: versionNumber/);
  assert.match(actions, /published !== "published"/);

  assert.match(data, /^import "server-only";/);
  assert.match(data, /requireAdmin\(\)/);
  assert.match(data, /getSupabaseAdminClient\(\)/);
  assert.match(data, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(data, /\.eq\("status", "draft"\)/);
  assert.match(data, /\.order\("version_number", \{ ascending: false \}\)/);
  assert.match(data, /\.limit\(1\)/);
  assert.match(data, /directPublishEligible: latestVersion\.versionNumber === 1/);
  assert.match(data, /TEACH_ESLAM_DRAFT_PAGE_SIZE = 20/);
  assert.match(data, /\.range\(offset, offset \+ TEACH_ESLAM_DRAFT_PAGE_SIZE\)/);

  assert.doesNotMatch(form, /service_role|SUPABASE_SERVICE_ROLE|createClient\(/i);
  assert.match(form, /state\.created && publishStatus !== "published"/);
  assert.match(page, /تعليم إسلام بالنص/);
  assert.match(page, /loadTeachEslamDrafts\(draftPageNumber\)/);
  assert.match(page, /draftPage\.drafts\.map/);
  assert.match(page, /draft\.directPublishEligible/);
  assert.match(page, /action=\{publishTeachEslamDraftAction\}/);
  assert.match(page, /name="item_id" value=\{draft\.id\}/);
  assert.match(page, /name="version_number" value=\{draft\.versionNumber\}/);
  assert.match(page, /راجع النسخة المعدلة/);
  assert.match(navigation, /label: "تعليم بالنص"/);
});

test("Teach Eslam persisted drafts remain reachable through text-route pagination", () => {
  const data = readSource("src/features/teach-eslam/data.ts");
  const page = readSource("src/app/admin/teach/text/page.tsx");

  assert.match(data, /from\("eslam_brain_items"\)/);
  assert.match(data, /from\("eslam_brain_versions"\)/);
  assert.match(data, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(data, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(data, /rows\.length > TEACH_ESLAM_DRAFT_PAGE_SIZE/);
  assert.match(data, /rows\.slice\(0, TEACH_ESLAM_DRAFT_PAGE_SIZE\)/);
  assert.match(page, /المسودة الجديدة غير المعدلة يمكن نشرها مباشرة/);
  assert.match(page, /بعد أي تعديل أو إعادة تصنيف من مركز المراجعة/);
  assert.match(page, /draftPage\.hasPreviousPage/);
  assert.match(page, /draftPage\.hasNextPage/);
  assert.match(page, /\/admin\/teach\/text\?draftPage=\$\{draftPage\.page - 1\}/);
  assert.match(page, /\/admin\/teach\/text\?draftPage=\$\{draftPage\.page \+ 1\}/);
  assert.match(page, /publishTeachEslamDraftAction/);
  assert.match(page, /راجع النسخة المعدلة/);
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
  assert.match(
    migration,
    /insert into public\.eslam_brain_versions[\s\S]*version_number/,
  );
  assert.match(migration, /'draft'/);
  assert.match(
    migration,
    /revoke execute on function public\.create_eslam_brain_draft\(jsonb\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(runtime, /failed version insert left a partial Brain item behind/);
  assert.match(runtime, /published_version_number = 1/);
  assert.match(ci, /supabase\/tests\/teach_eslam_runtime\.sql/);
});

test("text authoring remains isolated from voice and document ingestion internals", () => {
  const sources = [
    readSource("src/features/teach-eslam/core.ts"),
    readSource("src/features/teach-eslam/actions.ts"),
    readSource("src/features/teach-eslam/data.ts"),
    readSource("src/features/teach-eslam/teach-eslam-form.tsx"),
    readSource("src/app/admin/teach/text/page.tsx"),
  ].join("\n");

  assert.doesNotMatch(
    sources,
    /file_search|vector_store|microphone|mediaRecorder|audio_blob|voice_transcription|transcrib|document_ingestion|teaching_sources|bulk approve|mentee_memor|metric_snapshots/i,
  );
});
