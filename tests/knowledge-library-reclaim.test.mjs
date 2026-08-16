import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Knowledge reclaim keeps the previous provider cleanup pointer durable until replacement persistence", () => {
  const migration = readSource(
    "supabase/migrations/20260816072534_retain_knowledge_provider_ids_during_reclaim.sql",
  );
  const claimUpdate = sliceBetween(
    migration,
    "update public.knowledge_sources",
    "return query select v_source.id, 'claimed'::text",
  );

  assert.match(
    migration,
    /v_previous_openai_file_id := v_source\.openai_file_id/,
    "the reclaim RPC must capture the existing provider file cleanup pointer",
  );
  assert.match(
    migration,
    /v_previous_vector_store_id := v_source\.vector_store_id/,
    "the reclaim RPC must capture the existing vector-store cleanup pointer",
  );
  assert.doesNotMatch(
    claimUpdate,
    /openai_file_id\s*=\s*null/,
    "claiming a retry must not erase the previous provider file before cleanup succeeds",
  );
  assert.doesNotMatch(
    claimUpdate,
    /vector_store_id\s*=\s*null/,
    "claiming a retry must not erase the previous vector-store pointer before cleanup succeeds",
  );
});

test("only the exact active Knowledge claim may replace a retained cleanup pointer", () => {
  const provider = readSource("src/features/knowledge-library/openai.ts");
  const persistence = sliceBetween(
    provider,
    "async function persistClaimedProviderIds",
    "/** Attaches an uploaded OpenAI file",
  );

  assert.match(
    persistence,
    /\.eq\("index_claim_token", claimToken\)/,
    "replacement provider IDs must remain fenced by the exact claim token",
  );
  assert.doesNotMatch(
    persistence,
    /\.is\("openai_file_id", null\)/,
    "the exact claimant must be allowed to replace the retained old provider file pointer after cleanup",
  );
  assert.doesNotMatch(
    persistence,
    /\.is\("vector_store_id", null\)/,
    "the exact claimant must be allowed to replace the retained old vector-store pointer after cleanup",
  );
});

test("Knowledge retry cleans the retained previous provider file before replacement provider work", () => {
  const actions = readSource("src/features/knowledge-library/actions.ts");
  const indexing = sliceBetween(actions, "async function indexStoredSource", "function claimStatusResult");

  const cleanupIndex = indexing.indexOf("deleteOpenAIFileBestEffort(previousOpenAIFileId)");
  const createIndex = indexing.indexOf("createKnowledgeOpenAIFile(file)");
  const attachIndex = indexing.indexOf("attachKnowledgeVectorStoreFile(");

  assert.ok(cleanupIndex >= 0, "retry indexing must attempt cleanup of the retained previous provider file");
  assert.ok(createIndex > cleanupIndex, "replacement provider file creation must happen only after prior cleanup");
  assert.ok(attachIndex > createIndex, "replacement attachment must happen after the replacement file is created");
});
