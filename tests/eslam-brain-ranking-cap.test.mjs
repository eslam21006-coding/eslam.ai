import assert from "node:assert/strict";
import test from "node:test";

const importCore = () =>
  import(new URL("../src/features/eslam-brain/model-context-core.ts", import.meta.url).href);

function item(index, semanticLayer) {
  return {
    id: `${String(index).padStart(4, "0")}-${semanticLayer}`,
    semanticLayer,
    itemType: semanticLayer === "identity" ? "identity_fact" : "principle",
    priority: 50,
    title: `Item ${index}`,
    content: "x",
    summary: null,
    topics: [],
  };
}

test("global Brain cap is applied after semantic ranking", async () => {
  const {
    buildBoundedEslamBrainContext,
    MAX_ESLAM_BRAIN_QUERY_ITEMS,
  } = await importCore();

  const candidates = [
    ...Array.from({ length: 80 }, (_, index) => item(index, "brain")),
    ...Array.from({ length: 80 }, (_, index) => item(index + 100, "identity")),
  ];

  const context = buildBoundedEslamBrainContext(candidates);
  assert.ok(context);

  const selected = JSON.parse(context);
  assert.equal(selected.length, MAX_ESLAM_BRAIN_QUERY_ITEMS);
  assert.equal(selected.every((candidate) => candidate.layer === "identity"), true);
});
