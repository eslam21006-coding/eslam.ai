import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

const documentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("document teaching validates supported file metadata before upload", async () => {
  const {
    DOCUMENT_TEACHING_MAX_BYTES,
    defaultDocumentTeachingTitle,
    resolveDocumentTeachingMimeType,
    validateDocumentTeachingId,
    validateDocumentTeachingUploadIntent,
  } = await importSource("src/features/document-teaching/core.ts");

  assert.equal(DOCUMENT_TEACHING_MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(defaultDocumentTeachingTitle("  Growth Framework.pdf  "), "Growth Framework");
  assert.equal(resolveDocumentTeachingMimeType("source.pdf", "application/pdf"), "application/pdf");
  assert.equal(
    resolveDocumentTeachingMimeType("source.docx", ""),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  assert.equal(resolveDocumentTeachingMimeType("source.txt", "application/octet-stream"), "text/plain");
  assert.equal(resolveDocumentTeachingMimeType("source.md", "text/plain"), "text/markdown");
  assert.equal(resolveDocumentTeachingMimeType("source.pdf", "text/plain"), null);
  assert.equal(resolveDocumentTeachingMimeType("source.exe", "application/octet-stream"), null);

  assert.deepEqual(
    validateDocumentTeachingUploadIntent({
      fileName: "strategy.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      title: " Strategy Source ",
    }),
    {
      fileName: "strategy.pdf",
      title: "Strategy Source",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      extension: "pdf",
    },
  );

  assert.equal(
    validateDocumentTeachingUploadIntent({
      fileName: "../strategy.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      title: "Strategy",
    }),
    null,
  );
  assert.equal(
    validateDocumentTeachingUploadIntent({
      fileName: "strategy.pdf",
      mimeType: "application/pdf",
      sizeBytes: DOCUMENT_TEACHING_MAX_BYTES + 1,
      title: "Strategy",
    }),
    null,
  );
  assert.equal(
    validateDocumentTeachingUploadIntent({
      fileName: "strategy.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      title: " ",
    }),
    null,
  );
  assert.equal(validateDocumentTeachingId({ documentId }), documentId);
  assert.equal(validateDocumentTeachingId({ documentId: "bad" }), null);
});

test("document teaching server path is admin-only, owner-scoped, verified, and never writes Brain", () => {
  const actions = readSource("src/features/document-teaching/actions.ts");
  const database = readSource("src/features/document-teaching/database.ts");

  assert.match(actions, /^"use server";/);
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/);
  assert.match(actions, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(actions, /\.info\(document\.storage_path\)/);
  assert.match(actions, /sizeBytes !== document\.declared_size_bytes/);
  assert.match(actions, /storedContentType !== document\.mime_type/);
  assert.match(actions, /finalize_document_teaching_upload/);
  assert.match(actions, /status: "cancelling"/);
  assert.match(actions, /STALE_PENDING_UPLOAD_MS = 3 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(
    actions,
    /create_eslam_brain_draft|create_voice_teaching_drafts|review_eslam_brain_item|publish_eslam_brain_draft_direct|eslam_brain_items|eslam_brain_versions/,
  );

  assert.match(database, /^import "server-only";/);
  assert.match(database, /document_teaching_uploads: DocumentTeachingUploadTable/);
  assert.match(database, /finalize_document_teaching_upload/);
});

test("document teaching UI uploads only through signed private Storage and is linked from the training hub", () => {
  const uploader = readSource("src/features/document-teaching/document-uploader.tsx");
  const page = readSource("src/app/admin/teach/documents/page.tsx");
  const data = readSource("src/features/document-teaching/data.ts");
  const teachPage = readSource("src/app/admin/teach/page.tsx");

  assert.match(uploader, /uploadToSignedUrl\(intent\.storagePath, intent\.token, item\.file/);
  assert.match(uploader, /contentType: intent\.mimeType/);
  assert.match(uploader, /upsert: false/);
  assert.match(uploader, /finalizeDocumentTeachingUploadAction/);
  assert.match(uploader, /cancelDocumentTeachingUploadAction/);
  assert.match(uploader, /retryQueuedDocumentTeachingCleanupsAction/);
  assert.match(uploader, /type="file"[\s\S]*multiple/);
  assert.doesNotMatch(uploader, /Brain draft.*create|publish_eslam|review_eslam/);

  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /loadDocumentTeachingPage\(authorization\.userId, pageNumber\)/);
  assert.match(page, /DocumentTeachingUploader/);
  assert.match(page, /DocumentTeachingList/);
  assert.match(page, /href="\/admin\/teach"/);
  assert.match(page, /href="\/admin\/brain\?status=draft&page=1"/);
  assert.match(data, /DOCUMENT_TEACHING_PAGE_SIZE = 20/);
  assert.match(data, /\.eq\("created_by", userId\)/);
  assert.match(data, /\.eq\("status", "uploaded"\)/);
  assert.match(data, /\.range\(offset, offset \+ DOCUMENT_TEACHING_PAGE_SIZE\)/);
  assert.match(teachPage, /href: "\/admin\/teach\/documents"/);
  assert.match(teachPage, /href=\{method\.href\}/);
});

test("document teaching migration creates immutable document provenance without Brain materialization", () => {
  const migration = readSource(
    "supabase/migrations/20260812220415_create_document_teaching_uploads.sql",
  );
  const runtime = readSource("supabase/tests/document_teaching_uploads_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(migration, /create table public\.document_teaching_uploads/);
  assert.match(migration, /storage_bucket = 'eslam-teaching-documents'/);
  assert.match(migration, /source_type,[\s\S]*'document'/);
  assert.match(migration, /finalize_document_teaching_upload/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /grant execute on function public\.finalize_document_teaching_upload[\s\S]*to service_role/);
  assert.match(migration, /prevent_uploaded_document_teaching_update/);
  assert.match(migration, /prevent_uploaded_document_teaching_delete/);
  assert.doesNotMatch(
    migration,
    /insert into public\.eslam_brain_items|insert into public\.eslam_brain_versions|insert into public\.teaching_items|insert into public\.teaching_versions/,
  );

  assert.match(runtime, /non-owner finalize unexpectedly succeeded/);
  assert.match(runtime, /size mismatch unexpectedly finalized document source/);
  assert.match(runtime, /idempotent finalize duplicated document teaching source/);
  assert.match(runtime, /Task 21 unexpectedly created Brain content/);
  assert.match(runtime, /uploaded document audit row unexpectedly deleted/);
  assert.match(ci, /document_teaching_uploads_runtime\.sql/);
});
