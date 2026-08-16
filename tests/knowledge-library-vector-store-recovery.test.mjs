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

test("missing configured Knowledge vector stores are atomically invalidated and ready sources become retryable", () => {
  const migration = readSource(
    "supabase/migrations/20260816073619_invalidate_missing_knowledge_vector_store.sql",
  );

  assert.match(
    migration,
    /create or replace function public\.invalidate_missing_knowledge_vector_store/,
    "forward migration must define the missing-store invalidation RPC",
  );
  assert.match(
    migration,
    /select vector_store_id into v_current[\s\S]*for update/,
    "missing-store invalidation must lock the global configuration row",
  );
  assert.match(
    migration,
    /where library_key = 'global'[\s\S]*and vector_store_id = p_vector_store_id/,
    "only the still-current configured provider store may be cleared",
  );
  assert.match(
    migration,
    /set status = 'failed'[\s\S]*last_error_code = 'vector-store-not-found'/,
    "ready sources from the missing store must become retryable failed sources",
  );
  assert.match(
    migration,
    /where status = 'ready'[\s\S]*and vector_store_id = p_vector_store_id/,
    "only sources tied to the missing provider store may be invalidated",
  );
  assert.match(
    migration,
    /revoke execute[\s\S]*from public, anon, authenticated/,
    "client roles must not execute provider-store invalidation",
  );
  assert.match(
    migration,
    /grant execute[\s\S]*to service_role/,
    "service_role must retain provider-store invalidation execution",
  );
});

test("Knowledge provider boundary distinguishes a missing vector store from transient provider failures", () => {
  const provider = readSource("src/features/knowledge-library/openai.ts");
  const retrieveStore = sliceBetween(
    provider,
    "export async function retrieveKnowledgeVectorStore",
    "/** Deletes an unused vector store",
  );
  const attach = sliceBetween(
    provider,
    "export async function attachKnowledgeVectorStoreFile",
    "/** Reads provider indexing state",
  );

  assert.match(
    retrieveStore,
    /method: "GET"/,
    "provider existence check must read the configured vector store",
  );
  assert.match(
    retrieveStore,
    /allowNotFound: true/,
    "provider 404 must be represented as a missing store rather than a generic exception",
  );
  assert.match(
    attach,
    /error instanceof KnowledgeProviderError && error\.status === 404/,
    "attachment must recognize a missing provider vector store",
  );
  assert.match(
    attach,
    /invalidateMissingStoreBestEffort\(vectorStoreId\)/,
    "attachment 404 must invalidate the stale configured store",
  );
  assert.match(
    attach,
    /code: "vector-store-not-found"/,
    "attachment 404 must surface the normalized retryable recovery code",
  );
});

test("chat fails closed before enabling file_search when the configured Knowledge vector store is missing", () => {
  const loader = readSource("src/features/knowledge-library/model-context-data.ts");
  const retrievalStateCalls = loader.match(/\.rpc\(\s*"get_knowledge_retrieval_state"/g) ?? [];

  assert.equal(
    retrievalStateCalls.length,
    1,
    "chat retrieval eligibility must still come from one atomic database snapshot",
  );
  assert.match(
    loader,
    /retrieveKnowledgeVectorStore\([\s\S]*vectorStoreId[\s\S]*KNOWLEDGE_PROVIDER_CHECK_TIMEOUT_MS/,
    "chat must verify provider existence before returning the configured vector store",
  );
  assert.match(
    loader,
    /if \(!providerStoreId\)[\s\S]*invalidateMissingKnowledgeVectorStore\(vectorStoreId\)[\s\S]*return null/,
    "a missing provider store must be invalidated and file_search must stay disabled",
  );
  assert.match(
    loader,
    /KNOWLEDGE_PROVIDER_CHECK_TIMEOUT_MS\s*=\s*5_?000\b/,
    "provider existence verification must remain bounded while tolerating normal remote latency",
  );
});
