import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

const migrationPath =
  "supabase/migrations/20260812151341_create_teaching_review_workflow.sql";

test("Task 17 review filter contract defaults safely", async () => {
  const {
    parseTeachingReviewPage,
    parseTeachingReviewStatus,
    TEACHING_REVIEW_BULK_LIMIT,
    TEACHING_REVIEW_PAGE_SIZE,
  } = await importSource("src/features/teaching-review/core.ts");

  assert.equal(parseTeachingReviewStatus(undefined), "draft");
  assert.equal(parseTeachingReviewStatus("published"), "published");
  assert.equal(parseTeachingReviewStatus("not-a-status"), "draft");
  assert.equal(parseTeachingReviewPage(undefined), 1);
  assert.equal(parseTeachingReviewPage("3"), 3);
  assert.equal(parseTeachingReviewPage("0"), 1);
  assert.equal(TEACHING_REVIEW_PAGE_SIZE, 12);
  assert.equal(TEACHING_REVIEW_BULK_LIMIT, 50);
});

test("Task 17 review data and mutations remain admin-only server paths", () => {
  const data = readSource("src/features/teaching-review/data.ts");
  const actions = readSource("src/features/teaching-review/actions.ts");

  assert.match(data, /^import "server-only";/);
  assert.match(data, /requireAdmin\(\)/);
  assert.match(data, /getSupabaseAdminClient\(\)/);
  assert.match(data, /from\("eslam_brain_items"\)/);
  assert.match(data, /from\("eslam_brain_versions"\)/);
  assert.match(data, /from\("teaching_versions"\)/);
  assert.match(data, /from\("teaching_items"\)/);
  assert.match(data, /from\("teaching_sources"\)/);
  assert.match(data, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(data, /TEACHING_REVIEW_PAGE_SIZE/);

  assert.match(actions, /^"use server";/);
  assert.match(actions, /requireAdmin\(\)/g);
  assert.match(actions, /create_eslam_brain_review_version/);
  assert.match(actions, /review_eslam_brain_item/);
  assert.match(actions, /bulk_approve_eslam_brain_items/);
  assert.match(actions, /validateTeachEslamDraft/);
  assert.match(actions, /revalidatePath\("\/admin\/brain"\)/);
  assert.doesNotMatch(actions, /createClient\(|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});

test("Task 17 Brain page exposes review, provenance, versioning, lifecycle, and bulk UX", () => {
  const page = readSource("src/app/admin/brain/page.tsx");
  const navigation = readSource("src/features/admin-shell/navigation.ts");
  const teachPage = readSource("src/app/admin/teach/page.tsx");

  assert.match(page, /loadTeachingReviewPage\(status, page\)/);
  assert.match(page, /TEACHING_REVIEW_STATUSES\.map/);
  assert.match(page, /bulk-approve-form/);
  assert.match(page, /bulkApproveTeachingsAction/);
  assert.match(page, /approveTeachingAction/);
  assert.match(page, /publishTeachingAction/);
  assert.match(page, /archiveTeachingAction/);
  assert.match(page, /editTeachingDraftAction/);
  assert.match(page, /المصدر وProvenance/);
  assert.match(page, /حفظ كنسخة جديدة/);
  assert.match(page, /approvedVersionNumber/);
  assert.match(page, /publishedVersionNumber/);
  assert.match(page, /name="semantic_layer"/);
  assert.match(page, /name="item_type"/);
  assert.match(page, /name="change_note"/);
  assert.match(page, /form="bulk-approve-form"/);
  assert.match(navigation, /href: "\/admin\/brain"/);
  assert.match(navigation, /راجع التعليمات ومصادرها/);
  assert.match(teachPage, /href="\/admin\/brain\?status=draft&page=1"/);
});

test("Task 17 database review workflow binds approval and publication to exact immutable versions", () => {
  const migration = readSource(migrationPath);
  const privilegeMigration = readSource(
    "supabase/migrations/20260812151928_grant_teaching_review_approved_version_update.sql",
  );
  const types = readSource("src/types/database.ts");

  assert.match(migration, /add column approved_version_number integer/);
  assert.match(migration, /eslam_brain_items_approved_version_fk/);
  assert.match(migration, /references public\.eslam_brain_versions\(item_id, version_number\)/);
  assert.match(migration, /create index eslam_brain_items_review_queue_idx/);

  assert.match(migration, /create or replace function public\.create_eslam_brain_review_version\(p_payload jsonb\)/);
  assert.match(migration, /only draft teachings can be edited/);
  assert.match(migration, /stale teaching version/);
  assert.match(migration, /'entrypoint', 'teaching_review'/);
  assert.match(migration, /'capture_mode', 'review_edit'/);
  assert.match(migration, /insert into public\.eslam_brain_versions/);
  assert.match(migration, /insert into public\.teaching_versions/);

  assert.match(migration, /create or replace function public\.review_eslam_brain_item/);
  assert.match(migration, /when 'approve'/);
  assert.match(migration, /approved_version_number = p_version_number/);
  assert.match(migration, /when 'publish'/);
  assert.match(migration, /only the approved version can be published/);
  assert.match(migration, /published_version_number = p_version_number/);
  assert.match(migration, /when 'archive'/);

  assert.match(migration, /create or replace function public\.bulk_approve_eslam_brain_items/);
  assert.match(migration, /v_requested_count > 50/);
  assert.match(migration, /one or more teachings are not eligible for bulk approval/);

  assert.match(
    migration,
    /revoke all on function public\.create_eslam_brain_review_version\(jsonb\) from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_eslam_brain_review_version\(jsonb\) to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.review_eslam_brain_item\(uuid, uuid, text, integer\) to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.bulk_approve_eslam_brain_items\(uuid\[\], uuid\) to service_role/,
  );
  assert.match(privilegeMigration, /grant update \(approved_version_number\)/);

  assert.match(types, /approved_version_number: number \| null/);
  assert.match(types, /bulk_approve_eslam_brain_items:/);
  assert.match(types, /create_eslam_brain_review_version:/);
  assert.match(types, /review_eslam_brain_item:/);
});

test("Task 17 runtime covers immutable edits, lifecycle ordering, provenance, and atomic bulk approval", () => {
  const runtime = readSource("supabase/tests/teaching_review_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(runtime, /client role unexpectedly can execute teaching review RPCs/);
  assert.match(runtime, /review edit mutated or removed version 1/);
  assert.match(runtime, /review edit did not create version-specific provenance/);
  assert.match(runtime, /stale review edit left a partial version behind/);
  assert.match(runtime, /approval did not bind exact version 2/);
  assert.match(runtime, /publication did not preserve approved version pointer/);
  assert.match(runtime, /failed bulk approval partially mutated an eligible draft/);
  assert.match(runtime, /bulk approval did not bind the latest version for every draft/);
  assert.match(ci, /supabase\/tests\/teaching_review_runtime\.sql/);
});

test("Task 15 direct publish remains compatible by recording an implicit approved pointer", () => {
  const actions = readSource("src/features/teach-eslam/actions.ts");

  assert.match(actions, /approved_version_number:\s*versionNumber/);
  assert.match(actions, /published_version_number:\s*versionNumber/);
  assert.match(actions, /revalidatePath\("\/admin\/brain"\)/);
});

test("Task 17 stays within review UX scope", () => {
  const sources = [
    readSource("src/features/teaching-review/core.ts"),
    readSource("src/features/teaching-review/data.ts"),
    readSource("src/features/teaching-review/actions.ts"),
    readSource("src/app/admin/brain/page.tsx"),
  ].join("\n");

  assert.doesNotMatch(
    sources,
    /vector_store|file_search|embedding|transcription|MediaRecorder|audio_blob|document_extract|duplicate_detection|duplicateDetection|mentee_memor|metric_snapshots/i,
  );
});
