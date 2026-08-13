import assert from "node:assert/strict";
import test from "node:test";

import { executeDocumentTeachingExtraction } from "../src/features/document-teaching/extraction-execution.ts";

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

const sourceFile = () => new File(["source bytes"], "pricing.pdf", { type: "application/pdf" });
const clientForResponse = (response) => () => ({
  createFile: async () => ({ id: "file-code" }),
  createResponse: async () => response,
  deleteFile: async () => {},
});

test("incomplete document extraction maps to openai-truncated", async () => {
  const result = await executeDocumentTeachingExtraction({
    createClient: clientForResponse({ status: "incomplete", outputText: "" }),
    file: sourceFile(),
    model: "gpt-5-mini",
    sourceTitle: "Pricing Framework",
    completeCandidates: async () => true,
  });
  assert.equal(!result.ok && result.stage === "extraction" && result.errorCode, "openai-truncated");
});

test("unparsable document extraction maps to invalid-structured-output", async () => {
  const result = await executeDocumentTeachingExtraction({
    createClient: clientForResponse({ status: "completed", outputText: "not-json" }),
    file: sourceFile(),
    model: "gpt-5-mini",
    sourceTitle: "Pricing Framework",
    completeCandidates: async () => true,
  });
  assert.equal(!result.ok && result.stage === "extraction" && result.errorCode, "invalid-structured-output");
});

test("cleanup rejection is reported without changing extraction success", async () => {
  let cleanupFileId = null;
  let cleanupErrorMessage = null;
  let completionCalled = false;
  const result = await executeDocumentTeachingExtraction({
    createClient: () => ({
      createFile: async () => ({ id: "file-leak" }),
      createResponse: async () => ({ status: "completed", outputText: JSON.stringify({ candidates: [candidate] }) }),
      deleteFile: async () => { throw new Error("delete rejected"); },
    }),
    file: sourceFile(),
    model: "gpt-5-mini",
    sourceTitle: "Pricing Framework",
    completeCandidates: async () => { completionCalled = true; return true; },
    onCleanupError: (error, fileId) => {
      cleanupFileId = fileId;
      cleanupErrorMessage = error instanceof Error ? error.message : String(error);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(completionCalled, true);
  assert.equal(cleanupFileId, "file-leak");
  assert.equal(cleanupErrorMessage, "delete rejected");
});
