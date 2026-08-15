import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

function version(versionNumber, overrides = {}) {
  return {
    version_number: versionNumber,
    title: `Version ${versionNumber}`,
    content: `Content ${versionNumber}`,
    summary: null,
    topics: [],
    ...overrides,
  };
}

function publishedRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    semantic_layer: "brain",
    item_type: "principle",
    priority: 100,
    published_version_number: 2,
    published_version: version(2),
    ...overrides,
  };
}

test("published Brain row resolution accepts only the exact published immutable version", async () => {
  const { resolvePublishedEslamBrainItems } = await importSource(
    "src/features/eslam-brain/model-context-core.ts",
  );

  const resolved = resolvePublishedEslamBrainItems([
    publishedRow({
      published_version: [
        version(1, { content: "stale" }),
        version(2, { content: "published" }),
        version(3, { content: "future" }),
      ],
    }),
    publishedRow({
      id: "00000000-0000-4000-8000-000000000002",
      published_version_number: 4,
      published_version: version(3),
    }),
  ]);

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].content, "published");
  assert.equal(resolved[0].id, "00000000-0000-4000-8000-000000000001");
});

test("Brain model context is deterministic, priority and layer ordered, bounded, and defensive", async () => {
  const {
    buildBoundedEslamBrainContext,
    MAX_ESLAM_BRAIN_CONTENT_CHARS,
    MAX_ESLAM_BRAIN_CONTEXT_CHARS,
    resolvePublishedEslamBrainItems,
  } = await importSource("src/features/eslam-brain/model-context-core.ts");

  assert.equal(buildBoundedEslamBrainContext([]), null);

  const items = resolvePublishedEslamBrainItems([
    publishedRow({
      id: "00000000-0000-4000-8000-000000000020",
      priority: 200,
      published_version: version(2, { title: "Later", content: "Later guidance" }),
    }),
    publishedRow({
      id: "00000000-0000-4000-8000-000000000010",
      priority: 10,
      item_type: "hard_rule",
      published_version: version(2, {
        title: "First",
        content: "x".repeat(MAX_ESLAM_BRAIN_CONTENT_CHARS + 100),
        summary: "  useful summary  ",
        topics: [" offers ", "offers", "pricing"],
      }),
    }),
    publishedRow({
      id: "00000000-0000-4000-8000-000000000030",
      semantic_layer: "invalid",
    }),
  ]);

  const context = buildBoundedEslamBrainContext(items);
  assert.ok(context);
  const parsed = JSON.parse(context);
  assert.equal(parsed[0].priority, 10);
  assert.equal(parsed[0].type, "hard_rule");
  assert.equal(parsed[0].content.length, MAX_ESLAM_BRAIN_CONTENT_CHARS);
  assert.equal(parsed[0].content.endsWith("…"), true);
  assert.equal(parsed[0].summary, "useful summary");
  assert.deepEqual(parsed[0].topics, ["offers", "pricing"]);
  assert.equal(parsed.some((item) => item.layer === "invalid"), false);
  assert.equal(buildBoundedEslamBrainContext(items), context);

  const equalPriorityLayers = resolvePublishedEslamBrainItems([
    publishedRow({
      id: "00000000-0000-4000-8000-000000000001",
      semantic_layer: "cases",
      item_type: "example",
      priority: 50,
    }),
    publishedRow({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      semantic_layer: "identity",
      item_type: "identity_fact",
      priority: 50,
    }),
    publishedRow({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      semantic_layer: "brain",
      item_type: "principle",
      priority: 50,
    }),
  ]);
  const equalPriorityContext = JSON.parse(
    buildBoundedEslamBrainContext(equalPriorityLayers),
  );
  assert.deepEqual(
    equalPriorityContext.map((item) => item.layer),
    ["identity", "brain", "cases"],
  );

  const overflow = Array.from({ length: 40 }, (_, index) => ({
    ...items[0],
    id: `item-${String(index).padStart(3, "0")}`,
    priority: index,
    content: "y".repeat(MAX_ESLAM_BRAIN_CONTENT_CHARS),
  }));
  const bounded = buildBoundedEslamBrainContext(overflow);
  assert.ok(bounded);
  assert.ok(bounded.length <= MAX_ESLAM_BRAIN_CONTEXT_CHARS);
  const boundedItems = JSON.parse(bounded);
  assert.ok(boundedItems.length < overflow.length);
  assert.deepEqual(
    boundedItems.map((item) => item.priority),
    Array.from({ length: boundedItems.length }, (_, index) => index),
  );
});

test("Brain retrieval bounds each semantic layer before global ranking and fails open", () => {
  const data = readSource("src/features/eslam-brain/model-context-data.ts");

  assert.match(data, /^import "server-only";/);
  assert.match(data, /getSupabaseAdminClient\(\)/);
  assert.match(data, /ESLAM_BRAIN_SEMANTIC_LAYERS\.map\(async \(semanticLayer\)/);
  assert.match(data, /from\("eslam_brain_items"\)/);
  assert.match(data, /eslam_brain_versions!eslam_brain_items_published_version_fk/);
  assert.match(data, /\.eq\("status", "published"\)/);
  assert.match(data, /\.eq\("semantic_layer", semanticLayer\)/);
  assert.match(data, /\.not\("published_version_number", "is", null\)/);
  assert.match(data, /\.order\("priority", \{ ascending: true \}\)/);
  assert.match(data, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(data, /\.limit\(MAX_ESLAM_BRAIN_QUERY_ITEMS\)/);
  assert.match(data, /layerResults\.flatMap/);
  assert.match(data, /resolvePublishedEslamBrainItems/);
  assert.match(data, /buildBoundedEslamBrainContext/);
  assert.match(data, /return null;/);
  assert.doesNotMatch(data, /\bcreateClient\(\)|\.insert\(|\.update\(|\.delete\(/);
});

test("blocking and streaming requests receive identical Brain and Business DNA semantics", async () => {
  const {
    buildBasicEslamResponseRequest,
    buildBasicEslamStreamingResponseRequest,
  } = await importSource("src/features/conversations/assistant-request.ts");

  const messages = [{ role: "user", content: "راجع العرض الحالي" }];
  const businessDna = '{"business_name":"Acme"}';
  const brain = '[{"layer":"brain","type":"principle","priority":10,"title":"Rule","content":"Use proof"}]';

  const blocking = buildBasicEslamResponseRequest(
    messages,
    "test-model",
    businessDna,
    brain,
  );
  const streaming = buildBasicEslamStreamingResponseRequest(
    messages,
    "test-model",
    businessDna,
    brain,
  );

  assert.match(blocking.instructions, /trusted administrator-approved coaching intelligence/);
  assert.match(blocking.instructions, /Cases and examples[\s\S]*never treat case details as facts/);
  assert.match(blocking.instructions, /hard rules, contraindications, and corrections/);
  assert.ok(blocking.instructions.includes(brain));
  assert.ok(blocking.instructions.includes(businessDna));
  assert.equal(streaming.instructions, blocking.instructions);
  assert.deepEqual(streaming.input, blocking.input);
  assert.equal(blocking.store, false);
  assert.equal(streaming.store, false);
  assert.equal(streaming.stream, true);
  assert.equal(Object.hasOwn(blocking, "tools"), false);

  const withoutBrain = buildBasicEslamResponseRequest(messages, "test-model", businessDna, null);
  assert.doesNotMatch(withoutBrain.instructions, /Published Eslam Brain JSON:/);
  assert.match(withoutBrain.instructions, /Business DNA JSON:/);
});

test("blocking and streaming paths load and pass Brain context alongside later optional context layers", () => {
  const actions = readSource("src/features/conversations/actions.ts");
  const route = readSource("src/app/api/chat/stream/route.ts");
  const assistant = readSource("src/features/conversations/assistant.ts");

  assert.match(actions, /Promise\.all\(\[/);
  assert.match(actions, /loadBusinessDnaModelContext\(userId\)/);
  assert.match(actions, /loadEslamBrainModelContext\(\)/);
  assert.match(
    actions,
    /generateBasicEslamReply\([\s\S]*businessDnaContext,[\s\S]*eslamBrainContext/,
  );

  assert.match(route, /Promise\.all\(\[/);
  assert.match(route, /loadBusinessDnaModelContext\(userId\)/);
  assert.match(route, /loadEslamBrainModelContext\(\)/);
  assert.match(route, /streamBasicEslamReply\([\s\S]*businessDnaContext,[\s\S]*eslamBrainContext/);

  assert.match(assistant, /buildBasicEslamResponseRequest[\s\S]*eslamBrainContext/);
  assert.match(assistant, /buildBasicEslamStreamingResponseRequest[\s\S]*eslamBrainContext/);
});

test("client roles still have no direct Brain table privileges", () => {
  const schema = readSource(
    "supabase/migrations/20260812060822_create_eslam_brain_data_model.sql",
  );
  const hardening = readSource(
    "supabase/migrations/20260812061925_harden_eslam_brain_provenance_privileges.sql",
  );

  assert.match(
    schema,
    /revoke all on table public\.eslam_brain_items from public, anon, authenticated, service_role/,
  );
  assert.match(
    schema,
    /revoke all on table public\.eslam_brain_versions from public, anon, authenticated, service_role/,
  );
  assert.match(hardening, /grant select on table public\.eslam_brain_items to service_role/);
  assert.match(hardening, /grant select on table public\.eslam_brain_versions to service_role/);
  assert.doesNotMatch(hardening, /grant .* to (anon|authenticated)/i);
});

test("Brain retrieval implementation remains read-only even as later response layers add optional tools", () => {
  const sources = [
    readSource("src/features/eslam-brain/model-context-core.ts"),
    readSource("src/features/eslam-brain/model-context-data.ts"),
  ].join("\n");

  assert.doesNotMatch(
    sources,
    /vector_store|file_search|web_search|teaching_sources|mentee_memor|metric_snapshots|voice_transcription|document_ingestion|tools:/i,
  );
  assert.doesNotMatch(sources, /\.insert\(|\.update\(|\.delete\(/);
});
