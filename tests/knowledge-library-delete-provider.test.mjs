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

test("Knowledge deletion explicitly removes and confirms the vector-store attachment before deleting the OpenAI File", () => {
  const provider = readSource("src/features/knowledge-library/openai.ts");
  const detach = sliceBetween(
    provider,
    "async function deleteKnowledgeVectorStoreFile",
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

  assert.match(deleteFile, /from\("knowledge_sources"\)/);
  assert.match(deleteFile, /select\("vector_store_id"\)/);
  assert.match(deleteFile, /\.eq\("openai_file_id", fileId\)/);
  assert.match(deleteFile, /deleteKnowledgeVectorStoreFile\(source\.vector_store_id, fileId\)/);
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
