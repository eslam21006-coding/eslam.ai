import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const importSource = (relativePath) => import(new URL(`../${relativePath}`, import.meta.url).href);

test("YouTube source URL validation canonicalizes supported video URLs and rejects non-video hosts", async () => {
  const { validateYouTubeSourceUrl } = await importSource("src/features/youtube-sources/core.ts");
  const expected = { videoId: "dQw4w9WgXcQ", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
  assert.deepEqual(validateYouTubeSourceUrl("https://youtu.be/dQw4w9WgXcQ?t=10"), expected);
  assert.deepEqual(validateYouTubeSourceUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=abc"), expected);
  assert.deepEqual(validateYouTubeSourceUrl("https://youtube.com/shorts/dQw4w9WgXcQ"), expected);
  assert.deepEqual(validateYouTubeSourceUrl("https://youtube.com/live/dQw4w9WgXcQ"), expected);
  assert.deepEqual(validateYouTubeSourceUrl("https://youtube.com/embed/dQw4w9WgXcQ"), expected);
  assert.equal(validateYouTubeSourceUrl("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(validateYouTubeSourceUrl("https://www.youtube.com/@channel"), null);
  assert.equal(validateYouTubeSourceUrl("javascript:alert(1)"), null);
});

test("YouTube language hints and transcript artifacts are bounded", async () => {
  const { buildYouTubeTranscriptArtifact, validateYouTubeLanguage, YOUTUBE_TRANSCRIPT_MAX_CHARS } = await importSource("src/features/youtube-sources/core.ts");
  assert.equal(validateYouTubeLanguage("EN-us"), "en-US");
  assert.equal(validateYouTubeLanguage("ar"), "ar");
  assert.equal(validateYouTubeLanguage("english"), null);
  const artifact = buildYouTubeTranscriptArtifact({ title: "Offer Strategy", channelName: "Example Channel", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", language: "en", transcript: "Demand evidence should precede aggressive scaling." });
  assert.ok(artifact);
  assert.match(artifact.content, /TRANSCRIPT\nDemand evidence/);
  assert.equal(buildYouTubeTranscriptArtifact({ title: "Too big", channelName: null, canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", language: "en", transcript: "x".repeat(YOUTUBE_TRANSCRIPT_MAX_CHARS + 1) }), null);
});

test("YouTube provider boundary is server-only, key-protected, byte-bounded, and native-transcript only", () => {
  const provider = readSource("src/features/youtube-sources/provider.ts");
  assert.match(provider, /^import "server-only";/m);
  assert.match(provider, /process\.env\.SUPADATA_API_KEY/);
  assert.doesNotMatch(provider, /NEXT_PUBLIC_SUPADATA/);
  assert.match(provider, /AbortSignal\.timeout\(SUPADATA_TIMEOUT_MS\)/);
  assert.match(provider, /mode: "native"/);
  assert.match(provider, /response\.status === 206/);
  assert.match(provider, /\/transcript\/\$\{encodeURIComponent\(jobId\.trim\(\)\)\}/);
  assert.match(provider, /PROVIDER_MAX_RESPONSE_BYTES = YOUTUBE_TRANSCRIPT_MAX_BYTES \* 2/);
  assert.match(provider, /response\.headers\.get\("content-length"\)/);
  assert.match(provider, /response\.body\.getReader\(\)/);
  assert.match(provider, /receivedBytes > PROVIDER_MAX_RESPONSE_BYTES/);
  assert.match(provider, /JSON\.parse\(body\)/);
  assert.doesNotMatch(provider, /response\.json\(\)/);
  assert.match(provider, /raw\.content\.length > PROVIDER_MAX_SEGMENTS/);
  assert.match(provider, /normalized\.length > remaining/);
  assert.match(provider, /transcript-too-large/);
  assert.doesNotMatch(provider, /normalized\.slice\(0, remaining\)/);
  assert.doesNotMatch(provider, /mode: "auto"|mode: "generate"/);
});

test("YouTube import materializes into the existing private Knowledge lifecycle and never writes Brain", () => {
  const actions = readSource("src/features/youtube-sources/actions.ts");
  assert.match(actions, /requireAdmin\(\)/);
  assert.match(actions, /KNOWLEDGE_LIBRARY_BUCKET/);
  assert.match(actions, /\.from\("knowledge_sources"\)\.insert/);
  assert.match(actions, /source_kind: "youtube_transcript"/);
  assert.match(actions, /mime_type: "text\/plain"/);
  assert.match(actions, /\.upload\(storagePath, transcriptBlob/);
  assert.match(actions, /finalizeKnowledgeUploadAction\(\{ sourceId \}\)/);
  assert.match(actions, /youtube_transcript_imports/);
  assert.match(actions, /code === "transcript-too-large"/);
  assert.doesNotMatch(actions, /eslam_brain_items|eslam_brain_versions|create_teach_eslam|publish/i);
});

test("Existing pending or failed YouTube sources never masquerade as active indexing", () => {
  const actions = readSource("src/features/youtube-sources/actions.ts");
  const existingResult = actions.slice(actions.indexOf("function existingImportResult"), actions.indexOf("async function deleteStagingImport"));
  assert.match(existingResult, /source\.status === "ready"/);
  assert.match(existingResult, /source\.status === "indexing"/);
  assert.doesNotMatch(existingResult, /source\.status === "pending"/);
  assert.match(existingResult, /error: "source-exists"/);
});

test("Async YouTube job races preserve the first audit actor and remain globally operable by Admin", () => {
  const actions = readSource("src/features/youtube-sources/actions.ts");
  const saveJob = actions.slice(actions.indexOf("async function saveProviderJob"), actions.indexOf("export async function importYouTubeSourceAction"));
  const refreshJob = actions.slice(actions.indexOf("export async function refreshYouTubeTranscriptImportAction"));
  assert.match(saveJob, /\.insert\(\{/);
  assert.doesNotMatch(saveJob, /\.upsert\(/);
  assert.match(saveJob, /error\?\.code === "23505"/);
  assert.match(saveJob, /\.eq\("video_id", input\.videoId\)/);
  assert.match(refreshJob, /await requireAdmin\(\)/);
  assert.doesNotMatch(refreshJob, /\.eq\("created_by",/);
  assert.match(refreshJob, /actorId: staged\.created_by/);
});

test("Active YouTube jobs are loaded independently from bounded failed history", () => {
  const data = readSource("src/features/knowledge-library/data.ts");
  const loader = data.slice(data.indexOf("export async function loadYouTubeTranscriptImports"));
  assert.match(loader, /processingResult[\s\S]*\.eq\("status", "processing"\)[\s\S]*\.limit\(1000\)/);
  assert.match(loader, /failedResult[\s\S]*\.eq\("status", "failed"\)[\s\S]*\.limit\(12\)/);
  assert.match(loader, /processingResult\.data[\s\S]*failedResult\.data/);
});

test("Knowledge page degrades only the optional YouTube staging cards when that read fails", () => {
  const page = readSource("src/app/admin/knowledge/page.tsx");
  assert.match(page, /async function loadYouTubeTranscriptImportsSafely\(\)/);
  assert.match(page, /loadYouTubeTranscriptImports\(\)/);
  assert.match(page, /YouTube transcript imports unavailable; continuing without staging cards/);
  assert.match(page, /return \[\];/);
  assert.match(page, /loadKnowledgeSourcePage\(pageNumber\)[\s\S]*loadYouTubeTranscriptImportsSafely\(\)/);
});

test("Provider errors are isolated from Knowledge persistence failures and duplicate lookup failures are observable", () => {
  const actions = readSource("src/features/youtube-sources/actions.ts");
  assert.match(actions, /YouTube Knowledge duplicate lookup failed/);
  const importAction = actions.slice(actions.indexOf("export async function importYouTubeSourceAction"), actions.indexOf("export async function refreshYouTubeTranscriptImportAction"));
  assert.match(importAction, /try \{[\s\S]*fetchYouTubeProviderMetadata[\s\S]*startYouTubeProviderTranscript[\s\S]*\} catch \(error\) \{[\s\S]*return providerFailure\(error\);[\s\S]*\}/);
  assert.ok(importAction.indexOf("materializeYouTubeTranscript") > importAction.indexOf("return providerFailure(error)"));
  const refreshAction = actions.slice(actions.indexOf("export async function refreshYouTubeTranscriptImportAction"));
  assert.match(refreshAction, /try \{[\s\S]*pollYouTubeProviderTranscript[\s\S]*\} catch \(providerError\)/);
  assert.ok(refreshAction.indexOf("materializeYouTubeTranscript") > refreshAction.indexOf("catch (providerError)"));
});

test("YouTube importer exhaustively types action result errors", () => {
  const importer = readSource("src/features/youtube-sources/importer.tsx");
  assert.match(importer, /type YouTubeActionResult = YouTubeImportResult \| YouTubeImportRefreshResult/);
  assert.match(importer, /type YouTubeActionError = Extract<YouTubeActionResult, \{ ok: false \}>\["error"\]/);
  assert.match(importer, /Record<YouTubeActionError, string>/);
  assert.match(importer, /function messageForResult\(result: YouTubeActionResult\)/);
});

test("Task 27 migrations keep YouTube staging and provenance service-only and cover its creator FK", () => {
  const migration = readSource("supabase/migrations/20260817183000_add_youtube_knowledge_sources.sql");
  const indexMigration = readSource("supabase/migrations/20260817184500_index_youtube_import_created_by.sql");
  const runtime = readSource("supabase/tests/youtube_knowledge_sources_runtime.sql");
  assert.match(migration, /add column source_kind text not null default 'document'/);
  assert.match(migration, /source_kind in \('document', 'youtube_transcript'\)/);
  assert.match(migration, /knowledge_sources_youtube_video_unique_idx/);
  assert.match(migration, /create table public\.youtube_transcript_imports/);
  assert.match(migration, /created_by uuid not null references auth\.users\(id\) on delete restrict/);
  assert.match(migration, /alter table public\.youtube_transcript_imports enable row level security/);
  assert.match(migration, /revoke all on table public\.youtube_transcript_imports from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update, delete on table public\.youtube_transcript_imports to service_role/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(indexMigration, /youtube_transcript_imports_created_by_idx/);
  assert.match(indexMigration, /\(created_by\)/);
  assert.match(runtime, /foreign_key_violation/);
  assert.match(runtime, /YouTube staging unexpectedly accepted an unknown creator/);
});

test("Admin Knowledge UI exposes YouTube import without implying external material is Eslam teaching", () => {
  const page = readSource("src/app/admin/knowledge/page.tsx");
  const importer = readSource("src/features/youtube-sources/importer.tsx");
  assert.match(page, /YouTubeSourceImporter/);
  assert.match(importer, /لا يصبح رأي إسلام أو تعليماً في Brain تلقائياً/);
  assert.match(importer, /لا يتم إنشاء Transcript بالذكاء الاصطناعي تلقائياً/);
  assert.match(importer, /هذا الفيديو موجود بالفعل في مكتبة المعرفة/);
  assert.doesNotMatch(importer, /SUPADATA_API_KEY|x-api-key|api\.supadata\.ai/);
});

test("YouTube transcript provider secret remains backend-only and documented", () => {
  const env = readSource(".env.example");
  assert.match(env, /SUPADATA_API_KEY=supadata_replace_me/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_SUPADATA/);
});

test("Task 27 stays scoped away from Google Drive and Docs ingestion", () => {
  const taskSources = [readSource("src/features/youtube-sources/core.ts"), readSource("src/features/youtube-sources/provider.ts"), readSource("src/features/youtube-sources/actions.ts"), readSource("src/features/youtube-sources/importer.tsx")].join("\n");
  assert.doesNotMatch(taskSources, /google[_ -]?drive|google[_ -]?docs/i);
});
