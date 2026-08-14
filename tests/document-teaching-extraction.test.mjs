import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DOCUMENT_TEACHING_OPENAI_FILE_EXPIRY_SECONDS,
  executeDocumentTeachingDraftCreation,
  executeDocumentTeachingExtraction,
} from "../src/features/document-teaching/extraction-execution.ts";
import {
  buildDocumentTeachingResponseRequest,
  parseDocumentTeachingCandidates,
  validateDocumentTeachingDraftSelections,
  validateDocumentTeachingExtractionInput,
} from "../src/features/document-teaching/extraction-core.ts";

const VALID_ADMIN_ID = "55555555-5555-4555-8555-555555555555";
const VALID_DOCUMENT_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const VALID_EXTRACTION_ID = "cccccccc-3333-4333-8333-cccccccccccc";
const VALID_CANDIDATE_ID = "dddddddd-4444-4444-8444-dddddddddddd";
const VALID_BRAIN_ID = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";

const VALID_MODEL_CANDIDATE = {
  semantic_layer: "brain",
  item_type: "principle",
  priority: 100,
  title: "Judge CAC against contribution economics",
  content:
    "Evaluate acquisition cost against contribution economics before deciding whether CAC is acceptable.",
  summary: "Contribution economics contextualize CAC.",
  topics: ["CAC", "pricing"],
  source_excerpt: "Evaluate acquisition cost against contribution economics.",
  source_locator: "Page 4 · Pricing Economics",
};

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

test("document candidate parser rejects malformed output and skips duplicate teachings", () => {
  assert.deepEqual(parseDocumentTeachingCandidates("not-json"), { ok: false });

  const parsed = parseDocumentTeachingCandidates(
    JSON.stringify({ candidates: [VALID_MODEL_CANDIDATE] }),
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.candidates[0].source_locator, "Page 4 · Pricing Economics");

  const deduplicated = parseDocumentTeachingCandidates(
    JSON.stringify({ candidates: [VALID_MODEL_CANDIDATE, VALID_MODEL_CANDIDATE] }),
  );
  assert.equal(deduplicated.ok, true);
  assert.equal(deduplicated.ok && deduplicated.candidates.length, 1);
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

test("document extraction behavior creates a temporary user_data file, cleans it, then completes", async () => {
  const events = [];
  let fileInput = null;
  let responseRequest = null;
  let completedCandidates = null;

  const result = await executeDocumentTeachingExtraction({
    createClient: () => ({
      createFile: async (input) => {
        events.push("create-file");
        fileInput = input;
        return { id: "file-test" };
      },
      createResponse: async (request) => {
        events.push("create-response");
        responseRequest = request;
        return {
          status: "completed",
          outputText: JSON.stringify({ candidates: [VALID_MODEL_CANDIDATE] }),
        };
      },
      deleteFile: async (fileId) => {
        events.push("delete-file");
        assert.equal(fileId, "file-test");
      },
    }),
    file: new File(["source bytes"], "pricing.pdf", { type: "application/pdf" }),
    model: "gpt-5-mini",
    sourceTitle: "Pricing Framework",
    completeCandidates: async (candidates) => {
      events.push("complete");
      completedCandidates = candidates;
      return true;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(fileInput?.purpose, "user_data");
  assert.deepEqual(fileInput?.expires_after, {
    anchor: "created_at",
    seconds: DOCUMENT_TEACHING_OPENAI_FILE_EXPIRY_SECONDS,
  });
  assert.equal(responseRequest?.store, false);
  assert.equal(responseRequest?.input[0].content[1].file_id, "file-test");
  assert.equal(completedCandidates?.length, 1);
  assert.deepEqual(events, ["create-file", "create-response", "delete-file", "complete"]);
});

test("document extraction cleanup runs on response failure and skips completion", async () => {
  const events = [];
  let completionCalled = false;

  const result = await executeDocumentTeachingExtraction({
    createClient: () => ({
      createFile: async () => {
        events.push("create-file");
        return { id: "file-failure" };
      },
      createResponse: async () => {
        events.push("create-response");
        throw new Error("upstream failure");
      },
      deleteFile: async (fileId) => {
        events.push("delete-file");
        assert.equal(fileId, "file-failure");
      },
    }),
    file: new File(["source bytes"], "pricing.pdf", { type: "application/pdf" }),
    model: "gpt-5-mini",
    sourceTitle: "Pricing Framework",
    completeCandidates: async () => {
      completionCalled = true;
      return true;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.stage, "extraction");
  assert.equal(!result.ok && result.stage === "extraction" && result.errorCode, "openai-extraction");
  assert.equal(completionCalled, false);
  assert.deepEqual(events, ["create-file", "create-response", "delete-file"]);
});

test("document extraction contains client construction failure inside the retryable boundary", async () => {
  let completionCalled = false;
  const result = await executeDocumentTeachingExtraction({
    createClient: () => {
      throw new Error("OPENAI_API_KEY is not configured.");
    },
    file: new File(["source bytes"], "pricing.pdf", { type: "application/pdf" }),
    model: "gpt-5-mini",
    sourceTitle: "Pricing Framework",
    completeCandidates: async () => {
      completionCalled = true;
      return true;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.stage, "extraction");
  assert.equal(!result.ok && result.stage === "extraction" && result.errorCode, "openai-extraction");
  assert.equal(completionCalled, false);
});

test("reviewed document candidates call the draft persistence boundary with the exact payload", async () => {
  const validated = validateDocumentTeachingDraftSelections({
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
  assert.equal(validated.ok, true);
  if (!validated.ok) assert.fail("candidate fixture failed validation");

  let rpcPayload = null;
  const created = await executeDocumentTeachingDraftCreation(
    {
      extractionId: validated.extractionId,
      userId: VALID_ADMIN_ID,
      candidates: validated.candidates,
    },
    async (payload) => {
      rpcPayload = payload;
      return [
        {
          candidate_id: VALID_CANDIDATE_ID,
          brain_item_id: VALID_BRAIN_ID,
          version_number: 1,
        },
      ];
    },
  );

  assert.equal(rpcPayload?.p_extraction_id, VALID_EXTRACTION_ID);
  assert.equal(rpcPayload?.p_created_by, VALID_ADMIN_ID);
  assert.equal(rpcPayload?.p_candidates.length, 1);
  assert.equal(rpcPayload?.p_candidates[0].candidate_id, VALID_CANDIDATE_ID);
  assert.deepEqual(created, [
    { candidate_id: VALID_CANDIDATE_ID, brain_item_id: VALID_BRAIN_ID, version_number: 1 },
  ]);
});

test("Task 22 production extraction sources do not introduce vector stores or file search", async () => {
  const [actions, core, execution] = await Promise.all([
    readFile(new URL("../src/features/document-teaching/extraction-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/features/document-teaching/extraction-core.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/features/document-teaching/extraction-execution.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(`${actions}\n${core}\n${execution}`, /vector_stores|file_search/i);
});
