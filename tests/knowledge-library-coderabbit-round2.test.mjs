import assert from "node:assert/strict";
import test from "node:test";

import {
  createWithKnowledgeFallback,
  isRetryableKnowledgeToolError,
} from "../src/features/conversations/knowledge-response-fallback.ts";
import { readSource, sliceBetween } from "./helpers/source.mjs";

function staleKnowledgeError() {
  return Object.assign(
    new Error("file_search could not use vector_store vs_stale because it was not found"),
    { status: 404, code: "vector_store_not_found" },
  );
}

test("Knowledge response creation retries exactly once without file_search for a stale vector store", async () => {
  const attempts = [];
  const result = await createWithKnowledgeFallback("vs_stale", async (vectorStoreId) => {
    attempts.push(vectorStoreId);
    if (vectorStoreId) throw staleKnowledgeError();
    return "fallback-response";
  });

  assert.equal(result, "fallback-response");
  assert.deepEqual(attempts, ["vs_stale", null]);
  assert.equal(isRetryableKnowledgeToolError(staleKnowledgeError(), "vs_stale"), true);
});

test("Knowledge fallback does not retry unrelated failures or requests without Knowledge", async () => {
  const unrelatedAttempts = [];
  const unrelated = Object.assign(new Error("model service unavailable"), { status: 500 });
  await assert.rejects(
    createWithKnowledgeFallback("vs_test", async (vectorStoreId) => {
      unrelatedAttempts.push(vectorStoreId);
      throw unrelated;
    }),
    (error) => error === unrelated,
  );
  assert.deepEqual(unrelatedAttempts, ["vs_test"]);

  const disabledAttempts = [];
  const stale = staleKnowledgeError();
  await assert.rejects(
    createWithKnowledgeFallback(null, async (vectorStoreId) => {
      disabledAttempts.push(vectorStoreId);
      throw stale;
    }),
    (error) => error === stale,
  );
  assert.deepEqual(disabledAttempts, [null]);
});

test("Knowledge fallback propagates the single retry failure instead of looping", async () => {
  const attempts = [];
  const retryFailure = new Error("fallback model request failed");

  await assert.rejects(
    createWithKnowledgeFallback("vs_stale", async (vectorStoreId) => {
      attempts.push(vectorStoreId);
      if (vectorStoreId) throw staleKnowledgeError();
      throw retryFailure;
    }),
    (error) => error === retryFailure,
  );
  assert.deepEqual(attempts, ["vs_stale", null]);
});

test("blocking and streaming response creation both use pre-output Knowledge fallback", () => {
  const assistant = readSource("src/features/conversations/assistant.ts");
  const blocking = sliceBetween(
    assistant,
    "export async function generateBasicEslamReply",
    "export async function streamBasicEslamReply",
  );
  const streaming = sliceBetween(
    assistant,
    "export async function streamBasicEslamReply",
    "export async function persistAssistantMessage",
  );

  assert.match(blocking, /createWithKnowledgeFallback\(/);
  assert.match(blocking, /buildBasicEslamResponseRequest\(/);
  assert.match(streaming, /createWithKnowledgeFallback\(/);
  assert.match(streaming, /buildBasicEslamStreamingResponseRequest\(/);
  assert.ok(
    streaming.indexOf("createWithKnowledgeFallback(") < streaming.indexOf("consumeBasicEslamStream("),
    "stream fallback must finish before stream consumption/output begins",
  );
});

test("Knowledge indexing bounds the durable Storage download below the claim lease", () => {
  const actions = readSource("src/features/knowledge-library/actions.ts");
  const timeoutMatch = actions.match(
    /KNOWLEDGE_STORAGE_DOWNLOAD_TIMEOUT_MS\s*=\s*([\d_]+)\b/,
  );
  assert.ok(timeoutMatch, "Knowledge Storage download must declare an explicit timeout");
  const timeoutMs = Number(timeoutMatch[1].replaceAll("_", ""));
  assert.ok(timeoutMs > 0 && timeoutMs < 180_000, "Storage download must end before the 180-second claim lease");
  assert.match(
    actions,
    /\.download\(\s*source\.storage_path,\s*\{\},\s*\{\s*signal:\s*AbortSignal\.timeout\(KNOWLEDGE_STORAGE_DOWNLOAD_TIMEOUT_MS\)\s*\},?\s*\)/,
    "Storage download must pass the timeout signal through Supabase FetchParameters",
  );
});

test("Knowledge provider deletion uses short confirmation deadlines", () => {
  const provider = readSource("src/features/knowledge-library/openai.ts");
  assert.match(provider, /OPENAI_KNOWLEDGE_CONFIRM_TIMEOUT_MS\s*=\s*15_?000\b/);
  const uses = provider.match(/timeoutMs:\s*OPENAI_KNOWLEDGE_CONFIRM_TIMEOUT_MS/g) ?? [];
  assert.equal(uses.length, 2, "both deletion confirmation GETs must use the short deadline");
});

test("Knowledge auto-refresh reuses the canonical source-id validator", () => {
  const autoRefresh = readSource("src/features/knowledge-library/indexing-auto-refresh.ts");
  assert.match(autoRefresh, /import \{ validateKnowledgeSourceId \}/);
  assert.match(autoRefresh, /const afterId = validateKnowledgeSourceId\(input\.afterId\)/);
  assert.doesNotMatch(autoRefresh, /UUID_PATTERN|function validCursor/);
});

test("Knowledge admin UI preserves indexing-failure warnings and exposes queue list semantics", () => {
  const sourceList = readSource("src/features/knowledge-library/source-list.tsx");
  const uploader = readSource("src/features/knowledge-library/uploader.tsx");

  assert.match(sourceList, /"index-failed"[\s\S]{0,180}?تم حفظ المصدر، لكن الفهرسة تحتاج إعادة محاولة/);
  assert.match(uploader, /let indexFailed = 0/);
  assert.match(uploader, /onIndexFailed\?\.\(\)/);
  assert.match(uploader, /تحتاج إعادة فهرسة من قائمة المكتبة/);
  assert.match(uploader, /role="list" aria-label="مصادر المعرفة المختارة"/);
  assert.match(uploader, /role="listitem"/);
});

test("forward Knowledge migration documents fail-closed reclaimed indexing semantics", () => {
  const migration = readSource(
    "supabase/migrations/20260816191500_harden_document_claim_and_knowledge_indexes.sql",
  );
  const runtime = readSource("supabase/tests/knowledge_library_hardening_runtime.sql");

  assert.match(migration, /comment on function public\.get_knowledge_retrieval_state\(\)/);
  assert.match(migration, /Reclaimed or expired indexing claims[\s\S]{0,220}?fail-closed/);
  assert.match(runtime, /claim_knowledge_source_index\(/);
  assert.match(runtime, /previous_openai_file_id <> 'file_reclaimed_current'/);
  assert.match(runtime, /reclaimed configured-store indexing unexpectedly left Knowledge retrieval enabled/);
});
