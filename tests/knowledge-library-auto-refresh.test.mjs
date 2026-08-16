import assert from "node:assert/strict";
import test from "node:test";

import { readSource } from "./helpers/source.mjs";

const autoRefreshAction = readSource("src/features/knowledge-library/indexing-auto-refresh.ts");
const autoRefreshClient = readSource("src/features/knowledge-library/indexing-auto-refresh-client.tsx");
const knowledgeData = readSource("src/features/knowledge-library/data.ts");
const knowledgePage = readSource("src/app/admin/knowledge/page.tsx");

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
    /\.order\("id", \{ ascending: true \}\)[\s\S]{0,180}?\.limit\(MAX_AUTO_REFRESH_SOURCES\)/,
    "indexing batches must have a stable keyset order and remain bounded",
  );
  assert.match(
    autoRefreshAction,
    /afterId \? await query\(\)\.gt\("id", afterId\) : await query\(\)/,
    "successive reconciliation calls must advance beyond the previous batch cursor",
  );
  assert.match(
    autoRefreshAction,
    /if \(\(first\.data\?\.length \?\? 0\) > 0 \|\| !afterId\) return first;[\s\S]{0,180}?return query\(\);/,
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

test("automatic reconciliation stops after repeated failures and explicitly honors the server retry contract", () => {
  assert.match(
    autoRefreshClient,
    /MAX_AUTO_REFRESH_FAILURES\s*=\s*3\b/,
    "persistent refresh failures must have a small retry ceiling",
  );
  assert.match(
    autoRefreshClient,
    /if \(result\.ok\) \{[\s\S]{0,320}?consecutiveFailures = 0;[\s\S]{0,320}?\} else \{[\s\S]{0,320}?consecutiveFailures \+= 1;[\s\S]{0,320}?shouldContinue = result\.hasMore && consecutiveFailures < MAX_AUTO_REFRESH_FAILURES/,
    "server failures must explicitly consume the retry budget and honor hasMore",
  );
  assert.match(
    autoRefreshClient,
    /catch \(error\) \{[\s\S]{0,320}?consecutiveFailures \+= 1;[\s\S]{0,220}?shouldContinue = consecutiveFailures < MAX_AUTO_REFRESH_FAILURES/,
    "rejected refresh actions must also consume the retry budget",
  );
  assert.match(
    autoRefreshAction,
    /return \{ ok: false, checked: 0, hasMore: true, nextCursor: afterId \}/,
    "a query failure must explicitly tell a bounded client retry loop that work may remain",
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
    /select\("id", \{ count: "exact", head: true \}\)[\s\S]{0,220}?\.eq\("status", "indexing"\)/,
    "global indexing state must be counted independently of the visible page",
  );
  assert.match(
    autoRefreshClient,
    /useEffect\(\(\) => \{[\s\S]{0,160}?if \(!active\) return;/,
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
