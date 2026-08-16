import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const autoRefreshAction = await readFile(
  new URL("../src/features/knowledge-library/indexing-auto-refresh.ts", import.meta.url),
  "utf8",
);
const autoRefreshClient = await readFile(
  new URL("../src/features/knowledge-library/indexing-auto-refresh-client.tsx", import.meta.url),
  "utf8",
);
const knowledgeData = await readFile(
  new URL("../src/features/knowledge-library/data.ts", import.meta.url),
  "utf8",
);
const knowledgePage = await readFile(
  new URL("../src/app/admin/knowledge/page.tsx", import.meta.url),
  "utf8",
);

test("Knowledge Library automatically reconciles global provider-indexing sources", () => {
  assert.match(
    autoRefreshAction,
    /\.eq\("status", "indexing"\)/,
    "auto-refresh must query globally indexing Knowledge sources",
  );
  assert.match(
    autoRefreshAction,
    /refreshKnowledgeSourceAction\(\{ sourceId: row\.id \}\)/,
    "auto-refresh must reuse the fenced per-source provider reconciliation path",
  );
  assert.match(
    autoRefreshAction,
    /Promise\.allSettled/,
    "provider reconciliation should tolerate an individual source refresh failure",
  );
  assert.match(
    autoRefreshAction,
    /AUTO_REFRESH_CONCURRENCY = 5/,
    "provider reconciliation should use bounded concurrency",
  );
});

test("bounded auto-refresh rotates across indexing batches instead of starving rows after the first 100", () => {
  assert.match(
    autoRefreshAction,
    /\.order\("id", \{ ascending: true \}\)[\s\S]*\.limit\(MAX_AUTO_REFRESH_SOURCES\)/,
    "indexing batches must have a stable keyset order and remain bounded",
  );
  assert.match(
    autoRefreshAction,
    /afterId \? await query\(\)\.gt\("id", afterId\) : await query\(\)/,
    "successive reconciliation calls must advance beyond the previous batch cursor",
  );
  assert.match(
    autoRefreshAction,
    /if \(\(first\.data\?\.length \?\? 0\) > 0 \|\| !afterId\) return first;[\s\S]*return query\(\);/,
    "reconciliation must wrap to the beginning after reaching the end of the keyspace",
  );
  assert.match(
    autoRefreshAction,
    /nextCursor: \(count \?\? 0\) > 0 \? nextCursor : null/,
    "the server must return a cursor only while indexing work remains",
  );
  assert.match(
    autoRefreshClient,
    /refreshKnowledgeIndexingSourcesAction\(\{ afterId \}\)/,
    "the client poller must pass its current reconciliation cursor",
  );
  assert.match(
    autoRefreshClient,
    /afterId = result\.nextCursor/,
    "the client poller must advance to the next bounded reconciliation batch",
  );
});

test("Knowledge Library page exposes global indexing state and polls only while needed", () => {
  assert.match(
    knowledgeData,
    /hasIndexing: boolean/,
    "the server page model must expose whether any global source is indexing",
  );
  assert.match(
    knowledgeData,
    /select\("id", \{ count: "exact", head: true \}\)[\s\S]*\.eq\("status", "indexing"\)/,
    "global indexing state must be counted independently of the visible page",
  );
  assert.match(
    autoRefreshClient,
    /useEffect\(\(\) => \{[\s\S]*if \(!active\) return;/,
    "client polling must stop when no global indexing work remains",
  );
  assert.match(
    autoRefreshClient,
    /refreshKnowledgeIndexingSourcesAction\(\{ afterId \}\)/,
    "client polling must invoke the global reconciliation action",
  );
  assert.match(
    autoRefreshClient,
    /setTimeout\(poll, AUTO_REFRESH_INTERVAL_MS\)/,
    "polling must be scheduled after each completed refresh rather than overlap with setInterval",
  );
  assert.match(
    knowledgePage,
    /<KnowledgeIndexAutoRefresh active=\{sourcePage\.hasIndexing\} \/>/,
    "the Admin Knowledge page must enable polling from global indexing state",
  );
});
