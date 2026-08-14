import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("document uploader supports one batch with independent per-file recovery", () => {
  const uploader = readSource("src/features/document-teaching/document-uploader.tsx");

  assert.match(uploader, /type="file"[\s\S]*multiple[\s\S]*accept=\{DOCUMENT_TEACHING_ACCEPT\}/);
  assert.match(uploader, /function fileFingerprint\(file: File\)/);
  assert.match(uploader, /existingFingerprints\.has\(fingerprint\)/);
  assert.match(uploader, /duplicateCount \+= 1/);
  assert.match(uploader, /type BatchUploadItem = \{/);
  assert.match(uploader, /pendingIntent: DocumentTeachingUploadIntent \| null/);
  assert.match(uploader, /for \(const item of queued\) \{[\s\S]*await uploadItem\(item\)/);
  assert.match(uploader, /succeeded === queued\.length/);
  assert.match(uploader, /retryFinalization/);
  assert.match(uploader, /retryCleanup/);
  assert.match(uploader, /رفع الملفات الجاهزة/);
});

test("all three teaching paths expose the same canonical Brain metadata before draft creation", () => {
  const text = readSource("src/features/teach-eslam/teach-eslam-form.tsx");
  const voice = readSource("src/features/voice-teaching/workbench.tsx");
  const documents = readSource("src/features/document-teaching/extraction-workbench.tsx");

  for (const field of [
    "semantic_layer",
    "item_type",
    "priority",
    "title",
    "content",
    "summary",
    "topics",
    "change_note",
  ]) {
    assert.match(text, new RegExp(field), `text teaching should expose ${field}`);
    assert.match(voice, new RegExp(field), `voice teaching should expose ${field}`);
    assert.match(documents, new RegExp(field), `document teaching should expose ${field}`);
  }

  assert.match(text, /مكان المعرفة داخل Eslam Brain/);
  assert.match(text, /شكل المعرفة نفسها/);
  assert.match(voice, /createVoiceTeachingDraftsAction/);
  assert.match(documents, /createDocumentTeachingDraftsAction/);
});

test("training product surfaces do not expose development-phase or extraction debug language", () => {
  const productSurfaces = [
    "src/features/document-teaching/document-uploader.tsx",
    "src/features/document-teaching/document-list.tsx",
    "src/features/document-teaching/extraction-workbench.tsx",
    "src/features/voice-recorder/voice-recorder.tsx",
    "src/features/voice-transcription/transcription-list.tsx",
    "src/features/voice-teaching/workbench.tsx",
    "src/features/teach-eslam/teach-eslam-form.tsx",
  ].map(readSource).join("\n");

  assert.doesNotMatch(productSurfaces, /Task\s+\d+/i);
  assert.doesNotMatch(productSurfaces, /Recording ID:/i);
  assert.doesNotMatch(productSurfaces, /\battempt\s+\{/i);
  assert.doesNotMatch(productSurfaces, /\.extraction\.model\b/);
  assert.doesNotMatch(productSurfaces, /lastErrorCode\s*\}/);
  assert.doesNotMatch(productSurfaces, /انتهاء الـ lease|مهمة التحويل إلى نص لاحقاً/);
});

test("unfinished and internal-only routes do not render product placeholders", () => {
  const unfinishedAdmin = readSource("src/app/admin/[section]/page.tsx");
  const designSystem = readSource("src/app/design-system/page.tsx");

  for (const source of [unfinishedAdmin, designSystem]) {
    assert.match(source, /notFound\(\)/);
  }

  assert.doesNotMatch(unfinishedAdmin, /سيتم تنفيذ|مهمة مخصصة|Task\s+\d+/i);
  assert.doesNotMatch(designSystem, /مرجع داخلي|نظام التصميم/);
});
