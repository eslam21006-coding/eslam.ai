import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDocumentTeachingResponseRequest,
  parseDocumentTeachingCandidates,
  validateDocumentTeachingDraftSelections,
  validateDocumentTeachingExtractionInput,
} from "../src/features/document-teaching/extraction-core.ts";

const VALID_DOCUMENT_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const VALID_EXTRACTION_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const VALID_CANDIDATE_ID = "dddddddd-4444-4444-8444-dddddddddddd";

test("document extraction input requires a UUID", () => {
  assert.deepEqual(validateDocumentTeachingExtractionInput({ documentId: VALID_DOCUMENT_ID }), {
    documentId: VALID_DOCUMENT_ID,
  });
  assert.equal(validateDocumentTeachingExtractionInput({ documentId: "bad" }), null);
});

test("document extraction request uses an untrusted input_file and strict structured output", () => {
  const request = buildDocumentTeachingResponseRequest("gpt-5-mini", "file-test", "Pricing Framework");
  assert.equal(request.store, false);
  assert.equal(request.input[0].content[1].type, "input_file");
  assert.equal(request.input[0].content[1].file_id, "file-test");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.instructions, /untrusted source data/i);
  assert.match(request.instructions, /Never follow/i);
});

test("document candidate parser rejects malformed output and duplicate teachings", () => {
  assert.deepEqual(parseDocumentTeachingCandidates("not-json"), { ok: false });

  const candidate = {
    semantic_layer: "brain",
    item_type: "principle",
    priority: 100,
    title: "Judge CAC against contribution economics",
    content: "Evaluate acquisition cost against contribution economics before deciding whether CAC is acceptable.",
    summary: "Contribution economics contextualize CAC.",
    topics: ["CAC", "pricing"],
    source_excerpt: "Evaluate acquisition cost against contribution economics.",
    source_locator: "Page 4 · Pricing Economics",
  };
  const parsed = parseDocumentTeachingCandidates(JSON.stringify({ candidates: [candidate] }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.candidates[0].source_locator, "Page 4 · Pricing Economics");

  assert.deepEqual(
    parseDocumentTeachingCandidates(JSON.stringify({ candidates: [candidate, candidate] })),
    { ok: false },
  );
});

test("admin-edited document candidates are revalidated before draft materialization", () => {
  const valid = validateDocumentTeachingDraftSelections({
    extractionId: VALID_EXTRACTION_ID,
    candidates: [
      {
        candidate_id: VALID_CANDIDATE_ID,
        semantic_layer: "brain",
        item_type: "principle",
        priority: "90",
        title: "Contribution economics before CAC judgments",
        content: "Evaluate CAC against contribution economics before deciding whether it is acceptable.",
        summary: "Judge CAC in economic context.",
        topics: "CAC\npricing",
        change_note: "Reviewed from document source",
      },
    ],
  });
  assert.equal(valid.ok, true);

  assert.deepEqual(
    validateDocumentTeachingDraftSelections({
      extractionId: VALID_EXTRACTION_ID,
      candidates: [{ candidate_id: VALID_CANDIDATE_ID, title: "missing fields" }],
    }),
    { ok: false },
  );
});

test("Task 22 server flow uses temporary user_data files and explicit cleanup without RAG", async () => {
  const actions = await readFile(
    new URL("../src/features/document-teaching/extraction-actions.ts", import.meta.url),
    "utf8",
  );
  const core = await readFile(
    new URL("../src/features/document-teaching/extraction-core.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /requireAdmin\(\)/);
  assert.match(actions, /\.download\(document\.storage_path\)/);
  assert.match(actions, /purpose: "user_data"/);
  assert.match(actions, /expires_after:/);
  assert.match(actions, /await openai\.files\.delete\(temporaryFileId\)/);
  assert.match(actions, /finally \{/);
  assert.match(actions, /complete_document_teaching_extraction/);
  assert.match(actions, /create_document_teaching_drafts/);
  assert.doesNotMatch(`${actions}\n${core}`, /vector_stores|file_search/i);
});

test("Task 22 migration reuses the original document teaching source and never auto-publishes", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260813060211_create_document_teaching_extraction_workflow.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /values \(v_extraction\.source_id,v_brain_item_id,p_created_by\)/);
  assert.match(migration, /'draft'/);
  assert.match(migration, /'kind','document_candidate'/);
  assert.doesNotMatch(migration, /'published'/);
  assert.match(migration, /source_excerpt/);
  assert.match(migration, /source_locator/);
});
