import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Brain retrieval has one bounded deadline that aborts every outstanding layer query and fails open", () => {
  const data = readSource("src/features/eslam-brain/model-context-data.ts");

  assert.match(
    data,
    /ESLAM_BRAIN_RETRIEVAL_TIMEOUT_MS\s*=\s*2_?500\b/,
    "Brain retrieval must keep the bounded 2.5-second deadline",
  );
  assert.match(data, /const abortController = new AbortController\(\)/);
  assert.match(
    data,
    /ESLAM_BRAIN_SEMANTIC_LAYERS\.map\(async \(semanticLayer\)[\s\S]*?\.abortSignal\(abortController\.signal\)/,
  );
  assert.match(data, /const deadline = new Promise<null>/);
  assert.match(
    data,
    /setTimeout\(\(\) => \{[\s\S]*?resolve\(null\);[\s\S]*?abortController\.abort\(\);[\s\S]*?ESLAM_BRAIN_RETRIEVAL_TIMEOUT_MS/,
  );
  assert.match(data, /Promise\.race\(\[layerRetrieval, deadline\]\)/);
  assert.match(data, /if \(layerResults === null\)[\s\S]*?return null;/);
  assert.match(data, /finally \{[\s\S]*?clearTimeout\(deadlineTimer\)/);
});
