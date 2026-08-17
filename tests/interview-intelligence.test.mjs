import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const importSource = (relativePath) => import(new URL(`../${relativePath}`, import.meta.url).href);

const question = (overrides = {}) => ({
  id: crypto.randomUUID(),
  question: "What exact rule do you use?",
  topic: "Offer validation",
  status: "answered",
  createdAt: new Date().toISOString(),
  ...overrides,
});

test("Interview semantic similarity is deterministic and thresholded", async () => {
  const { cosineSimilarity, findSemanticDuplicateIndex, INTERVIEW_SEMANTIC_DUPLICATE_THRESHOLD } = await importSource("src/features/interview-eslam/intelligence-core.ts");
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), null);
  assert.equal(findSemanticDuplicateIndex([1, 0], [[0, 1], [0.99, 0.01]])?.index, 1);
  assert.ok(INTERVIEW_SEMANTIC_DUPLICATE_THRESHOLD >= 0.85 && INTERVIEW_SEMANTIC_DUPLICATE_THRESHOLD < 1);
});

test("Interview intelligence prevents endless drill-down unless the Admin explicitly focuses it", async () => {
  const { shouldRejectInterviewTopicSequence } = await importSource("src/features/interview-eslam/intelligence-core.ts");
  const history = [
    question({ id: "one", topic: "Offer validation", question: "Q1" }),
    question({ id: "two", topic: "Offer validation evidence", question: "Q2" }),
  ];
  assert.equal(shouldRejectInterviewTopicSequence("Offer validation thresholds", history), true);
  assert.equal(shouldRejectInterviewTopicSequence("Offer validation thresholds", history, "Offer validation"), false);
  assert.equal(shouldRejectInterviewTopicSequence("Sales objections", history), false);
  assert.equal(shouldRejectInterviewTopicSequence("Offer validation", [question({ status: "skipped" })], "Offer validation"), true);
});

test("Interview coverage reports observed outcomes without inventing a completion percentage", async () => {
  const { buildInterviewCoverage } = await importSource("src/features/interview-eslam/intelligence-core.ts");
  const coverage = buildInterviewCoverage([
    { gapType: "missing_belief", status: "answered", count: 2 },
    { gapType: "missing_decision_rule", status: "skipped", count: 1 },
    { gapType: "incomplete_sales_philosophy", status: "not_relevant", count: 1 },
  ]);
  assert.equal(coverage.totalCount, 7);
  assert.equal(coverage.exploredCount, 3);
  assert.equal(coverage.domains.find((item) => item.id === "beliefs").captured, 2);
  assert.equal(coverage.domains.find((item) => item.id === "decision_rules").deferred, 1);
  assert.equal(coverage.domains.find((item) => item.id === "growth_sales").excluded, 1);
  assert.ok(coverage.domains.some((item) => item.explored === false));
  assert.equal("percentage" in coverage, false);
});

test("Interview focus is optional, bounded, and separate from grounding", async () => {
  const { validateInterviewFocus, buildInterviewIntelligenceDirective, buildInterviewCoverage } = await importSource("src/features/interview-eslam/intelligence-core.ts");
  assert.equal(validateInterviewFocus("  Client selection  "), "Client selection");
  assert.equal(validateInterviewFocus("   "), "");
  assert.equal(validateInterviewFocus("x".repeat(121)), null);
  const directive = buildInterviewIntelligenceDirective("Client selection", buildInterviewCoverage([]));
  assert.match(directive, /routing metadata, not evidence/);
  assert.match(directive, /needs_context/);
});

test("Interview generation uses embeddings after deterministic grounding validation", () => {
  const actions = readSource("src/features/interview-eslam/actions.ts");
  const server = readSource("src/features/interview-eslam/intelligence-server.ts");
  const client = readSource("src/lib/openai/client.ts");
  assert.match(actions, /parseInterviewQuestionOutput[\s\S]*shouldRejectInterviewTopicSequence[\s\S]*findSemanticInterviewDuplicate[\s\S]*record_interview_question/);
  assert.match(server, /embeddings\.create/);
  assert.match(server, /encoding_format: "float"/);
  assert.match(client, /OPENAI_EMBEDDING_MODEL/);
  assert.match(client, /text-embedding-3-small/);
});

test("Interview Admin workbench exposes focus, coverage, history, and safe session completion", () => {
  const page = readSource("src/app/admin/teach/interview/page.tsx");
  const actions = readSource("src/features/interview-eslam/actions.ts");
  const data = readSource("src/features/interview-eslam/data.ts");
  assert.match(page, /خريطة التغطية/);
  assert.match(page, /Focus اختياري/);
  assert.match(page, /تاريخ المقابلات/);
  assert.match(page, /completeInterviewSessionAction/);
  assert.match(page, /setInterviewFocusAction/);
  assert.match(actions, /set_interview_session_focus/);
  assert.match(actions, /complete_interview_session/);
  assert.match(data, /get_interview_intelligence_stats/);
  assert.doesNotMatch(data, /knowledge_sources|youtube|google_drive/i);
});

test("Task 25 migrations are forward-only, service-only, retry-safe, and CI runs the runtime regression", () => {
  const migration = readSource("supabase/migrations/20260817125000_add_interview_intelligence.sql");
  const completionGuard = readSource("supabase/migrations/20260817130500_guard_interview_completion_extraction.sql");
  const oldMigration = readSource("supabase/migrations/20260817101500_create_interview_eslam.sql");
  const runtime = readSource("supabase/tests/interview_intelligence_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");
  assert.match(migration, /alter table public\.interview_sessions/);
  assert.match(migration, /create or replace function public\.set_interview_session_focus/);
  assert.match(migration, /create or replace function public\.complete_interview_session/);
  assert.match(migration, /create or replace function public\.get_interview_intelligence_stats/);
  assert.match(migration, /revoke all on function public\.set_interview_session_focus[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.get_interview_intelligence_stats[\s\S]*to service_role/);
  assert.match(completionGuard, /extraction_status in \('pending', 'processing', 'failed'\)/);
  assert.match(completionGuard, /revoke all on function public\.complete_interview_session[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(runtime, /cross-owner focus update did not fail closed/);
  assert.match(runtime, /session completion hid an unresolved interview extraction/);
  assert.match(runtime, /open question was not preserved as skipped when session completed/);
  assert.match(oldMigration, /-- Task 24 — Interview Eslam MVP\./);
  assert.match(ci, /interview_intelligence_runtime\.sql/);
});
