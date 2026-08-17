import assert from "node:assert/strict";
import test from "node:test";

import { readSource, sliceBetween } from "./helpers/source.mjs";

test("Knowledge deletion resolves a source or global vector-store pointer before deleting the OpenAI File", () => {
  const provider = readSource("src/features/knowledge-library/openai.ts");
  const detach = sliceBetween(
    provider,
    "async function deleteKnowledgeVectorStoreFile",
    "/** Resolves the best known vector-store cleanup pointer",
  );
  const resolver = sliceBetween(
    provider,
    "async function resolveKnowledgeCleanupVectorStoreId",
    "/** Deletes the durable OpenAI File",
  );
  const deleteFile = sliceBetween(
    provider,
    "export async function deleteKnowledgeOpenAIFile",
    "export function knowledgeProviderErrorCode",
  );

  assert.match(detach, /\/vector_stores\/\$\{encodeURIComponent\(vectorStoreId\)\}\/files\/\$\{encodeURIComponent\(fileId\)\}/);
  assert.match(detach, /method: "DELETE"/);
  assert.match(detach, /method: "GET"/);
  assert.match(detach, /allowNotFound: true/);
  assert.match(detach, /if \(remaining\)/);
  assert.match(detach, /vector-file-delete-not-confirmed/);

  assert.match(resolver, /from\("knowledge_sources"\)/);
  assert.match(resolver, /select\("vector_store_id"\)/);
  assert.match(resolver, /\.eq\("openai_file_id", fileId\)/);
  assert.match(resolver, /if \(source\?\.vector_store_id\) return source\.vector_store_id/);
  assert.match(resolver, /from\("knowledge_library_config"\)/);
  assert.match(resolver, /\.eq\("library_key", "global"\)/);
  assert.match(
    resolver,
    /return config\?\.vector_store_id && typeof config\.vector_store_id === "string"/,
    "cleanup must fall back to the configured global store when a failed row lost its pointer",
  );

  assert.match(deleteFile, /resolveKnowledgeCleanupVectorStoreId\(fileId\)/);
  assert.match(deleteFile, /deleteKnowledgeVectorStoreFile\(vectorStoreId, fileId\)/);
  assert.ok(
    deleteFile.indexOf("deleteKnowledgeVectorStoreFile") < deleteFile.indexOf("`/files/${encodeURIComponent(fileId)}`"),
    "File Search attachment cleanup must happen before deleting the durable OpenAI File",
  );
  assert.match(deleteFile, /method: "GET"/);
  assert.match(deleteFile, /file-delete-not-confirmed/);
});

test("Knowledge source metadata is removed only after confirmed provider cleanup", () => {
  const actions = readSource("src/features/knowledge-library/actions.ts");
  const deletion = sliceBetween(
    actions,
    "export async function deleteKnowledgeSourceAction",
    "\n}",
  );

  assert.match(deletion, /if \(source\.openai_file_id\) await deleteKnowledgeOpenAIFile\(source\.openai_file_id\)/);
  assert.ok(
    deletion.indexOf("deleteKnowledgeOpenAIFile") < deletion.indexOf('.from("knowledge_sources")'),
    "provider cleanup must complete before the source row is deleted",
  );
  assert.match(deletion, /catch \(error\)/);
  assert.match(deletion, /return \{ ok: false, error: "operation-failed" \}/);
});
