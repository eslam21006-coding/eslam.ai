import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const importSource = (relativePath) => import(new URL(`../${relativePath}`, import.meta.url).href);
const context = {
  sources: [
    { id: "brain:one:v1", type: "brain", label: "Approved Brain · Acquisition rule", lifecycleStatus: "approved", content: "Title: Acquisition readiness\nTeaching: Do not scale cold traffic before the offer has evidence of manual sales." },
    { id: "interview_answer:two", type: "interview_answer", label: "Interview answer · Offer validation", content: "I consider an offer validated when real clients have paid for it manually and the sales conversation is repeatable." },
  ],
  previousQuestions: [{ id: "question-old", question: "What exactly counts as manual offer validation before you use cold ads?", topic: "Offer validation", status: "answered", createdAt: "2026-08-17T10:00:00.000Z" }],
  suppressedTopics: [{ topicKey: "corporate procurement", topicLabel: "Corporate procurement" }],
};

test("Grounded Question Contract accepts exact evidence and rejects invented grounding", async () => {
  const { parseInterviewQuestionOutput } = await importSource("src/features/interview-eslam/core.ts");
  const valid = parseInterviewQuestionOutput(JSON.stringify({
    decision: "ask",
    question: "You say paid clients are required for validation. What would make you reject those sales as weak evidence even if three people already bought?",
    topic: "Quality of offer-validation evidence",
    why_this_question: "The existing answer establishes paid manual sales as evidence but does not define when that evidence is misleading.",
    gap_type: "missing_exception",
    groundings: [{ source_id: "interview_answer:two", exact_excerpt: "real clients have paid for it manually" }],
    relevant_known_facts: [{ source_id: "interview_answer:two", fact: "Eslam treats manual paid sales as validation evidence." }],
    follow_up_recommended: false,
  }), context);
  assert.equal(valid.ok, true);
  assert.equal(valid.decision, "ask");
  assert.equal(valid.question.groundingSources[0].source_id, "interview_answer:two");
  assert.match(valid.question.questionFingerprint, /^[0-9a-f]{64}$/);
  const invented = parseInterviewQuestionOutput(JSON.stringify({
    decision: "ask", question: "When should a coach avoid ads?", topic: "Ad readiness", why_this_question: "Testing a gap.", gap_type: "missing_decision_rule",
    groundings: [{ source_id: "brain:one:v1", exact_excerpt: "Eslam requires exactly $10k revenue before ads." }], relevant_known_facts: [], follow_up_recommended: false,
  }), context);
  assert.deepEqual(invented, { ok: false, reason: "ungrounded-excerpt" });
});

test("Grounded Question Contract blocks repeat questions and suppressed topics", async () => {
  const { parseInterviewQuestionOutput } = await importSource("src/features/interview-eslam/core.ts");
  const duplicate = parseInterviewQuestionOutput(JSON.stringify({
    decision: "ask", question: "What exactly counts as manual offer validation before you use cold ads?", topic: "Offer validation", why_this_question: "Would otherwise repeat the previous question.", gap_type: "missing_decision_rule",
    groundings: [{ source_id: "brain:one:v1", exact_excerpt: "evidence of manual sales" }], relevant_known_facts: [], follow_up_recommended: true,
  }), context);
  assert.deepEqual(duplicate, { ok: false, reason: "duplicate-question" });
  const suppressed = parseInterviewQuestionOutput(JSON.stringify({
    decision: "ask", question: "The current material does not cover procurement. How should a corporate buyer run procurement?", topic: "Corporate procurement process", why_this_question: "Would otherwise enter a suppressed topic.", gap_type: "missing_eslam_opinion",
    groundings: [{ source_id: "brain:one:v1", exact_excerpt: "cold traffic" }], relevant_known_facts: [], follow_up_recommended: false,
  }), context);
  assert.deepEqual(suppressed, { ok: false, reason: "suppressed-topic" });
});

test("question generation explicitly stops when grounded context is insufficient", async () => {
  const { parseInterviewQuestionOutput } = await importSource("src/features/interview-eslam/core.ts");
  assert.deepEqual(parseInterviewQuestionOutput(JSON.stringify({
    decision: "needs_context", question: null, topic: null,
    why_this_question: "The supplied material does not contain enough Eslam-specific evidence for a non-generic question.",
    gap_type: null, groundings: [], relevant_known_facts: [], follow_up_recommended: false,
  }), { sources: [], previousQuestions: [], suppressedTopics: [] }), {
    ok: true, decision: "needs_context", explanation: "The supplied material does not contain enough Eslam-specific evidence for a non-generic question.",
  });
});

test("Interview answer extraction is answer-grounded, bounded, and never publishes", async () => {
  const { buildInterviewTeachingRequest, parseInterviewTeachingCandidates } = await importSource("src/features/interview-eslam/core.ts");
  const answer = "I require three manual sales before cold ads. Otherwise I am testing the offer, message, traffic, and sales process at the same time.";
  const parsed = parseInterviewTeachingCandidates(JSON.stringify({ candidates: [{
    semantic_layer: "brain", item_type: "diagnostic_rule", priority: 50, title: "Manual-sales threshold before cold ads",
    content: "Require evidence of manual sales before using cold paid acquisition to scale an offer.", summary: "Validate manually before cold acquisition.",
    topics: ["offer validation", "paid acquisition"], source_excerpt: "I require three manual sales before cold ads.",
  }] }), answer);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0].source_excerpt, "I require three manual sales before cold ads.");
  const ungrounded = parseInterviewTeachingCandidates(JSON.stringify({ candidates: [{
    semantic_layer: "brain", item_type: "principle", priority: 50, title: "Invented threshold", content: "Only run ads after ten thousand dollars in revenue.", summary: null, topics: [], source_excerpt: "ten thousand dollars in revenue",
  }] }), answer);
  assert.deepEqual(ungrounded, { ok: false, reason: "ungrounded-candidate" });
  const request = buildInterviewTeachingRequest("gpt-5-mini", "Question?", answer);
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
});

test("Interview server/UI route stays Admin-only and routes extracted answers to Brain drafts only", () => {
  const actions = readSource("src/features/interview-eslam/actions.ts");
  const data = readSource("src/features/interview-eslam/data.ts");
  const page = readSource("src/app/admin/teach/interview/page.tsx");
  const navigation = readSource("src/features/admin-shell/navigation.ts");
  const hub = readSource("src/app/admin/teach/page.tsx");
  assert.match(actions, /^"use server";/);
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /submit_interview_answer/);
  assert.match(actions, /claim_interview_answer_extraction/);
  assert.match(actions, /complete_interview_answer_extraction/);
  assert.doesNotMatch(actions, /publish_eslam_brain_draft_direct|publishTeachingAction|publish_eslam_brain_item/);
  assert.match(data, /^import "server-only";/);
  assert.match(data, /\.eq\("created_by", userId\)/);
  assert.match(page, /saveInterviewAnswerAction/);
  assert.match(page, /skipInterviewQuestionAction/);
  assert.match(page, /notRelevantInterviewQuestionAction/);
  assert.match(page, /name="suppress_topic"/);
  assert.match(navigation, /href: "\/admin\/teach\/interview"/);
  assert.match(hub, /href: "\/admin\/teach\/interview"/);
});

test("Interview migration is service-only, forward-only lineage, and creates only draft Brain items", () => {
  const migration = readSource("supabase/migrations/20260817101500_create_interview_eslam.sql");
  const runtime = readSource("supabase/tests/interview_eslam_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");
  assert.match(migration, /create table public\.interview_sessions/);
  assert.match(migration, /create table public\.interview_questions/);
  assert.match(migration, /create table public\.interview_answers/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.interview_answers from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.submit_interview_answer[\s\S]*to service_role/);
  assert.match(migration, /insert into public\.teaching_items/);
  assert.match(migration, /insert into public\.teaching_versions/);
  assert.match(runtime, /authenticated role unexpectedly read interview sessions/);
  assert.match(runtime, /raw interview answer unexpectedly created Brain content before extraction/);
  assert.match(runtime, /interview candidate bypassed normal Brain review lifecycle/);
  assert.match(runtime, /interview Brain draft lost exact answer provenance/);
  assert.match(runtime, /explicit interview topic suppression was not persisted/);
  assert.match(ci, /interview_eslam_runtime\.sql/);
});
