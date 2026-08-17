import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const importSource = (relativePath) => import(new URL(`../${relativePath}`, import.meta.url).href);

const knowledgeSourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const knowledgeSource = {
  id: `knowledge_library:${knowledgeSourceId}`,
  type: "knowledge_library",
  label: "Knowledge · Offer Research",
  content: "A repeatable offer should have evidence of demand before aggressive paid acquisition.",
};
const emptyCoverage = {
  domains: [
    { id: "beliefs", label: "beliefs", captured: 0, deferred: 0, excluded: 0, open: 0, explored: false },
    { id: "decision_rules", label: "decision rules", captured: 0, deferred: 0, excluded: 0, open: 0, explored: false },
    { id: "experience", label: "experience", captured: 0, deferred: 0, excluded: 0, open: 0, explored: false },
    { id: "systems", label: "systems", captured: 0, deferred: 0, excluded: 0, open: 0, explored: false },
    { id: "audience_offer", label: "audience offer", captured: 0, deferred: 0, excluded: 0, open: 0, explored: false },
    { id: "growth_sales", label: "growth sales", captured: 0, deferred: 0, excluded: 0, open: 0, explored: false },
    { id: "other", label: "other", captured: 0, deferred: 0, excluded: 0, open: 0, explored: false },
  ],
  exploredCount: 0,
  totalCount: 7,
};

function questionOutput(relevantKnownFacts = []) {
  return JSON.stringify({
    decision: "ask",
    question: "What exact evidence do you personally require before you consider an offer validated enough to scale paid acquisition?",
    topic: "Offer validation threshold",
    why_this_question: "The reference gives a general demand principle, but Eslam's own operating threshold is not stated.",
    gap_type: "missing_decision_rule",
    groundings: [{
      source_id: knowledgeSource.id,
      exact_excerpt: "evidence of demand before aggressive paid acquisition",
    }],
    relevant_known_facts: relevantKnownFacts,
    follow_up_recommended: false,
  });
}

test("Knowledge retrieval queries are bounded and prioritize explicit Interview focus", async () => {
  const { buildInterviewKnowledgeQueries, INTERVIEW_KNOWLEDGE_MAX_QUERIES } = await importSource("src/features/interview-eslam/knowledge-guidance-core.ts");
  const context = { sources: [], previousQuestions: [], suppressedTopics: [] };
  const queries = buildInterviewKnowledgeQueries(context, { focusTopic: "Client selection", coverage: emptyCoverage });
  assert.equal(queries.length, INTERVIEW_KNOWLEDGE_MAX_QUERIES);
  assert.equal(queries[0], "Client selection");
  assert.match(queries[1], /decision rules/);
  assert.match(queries[2], /case studies/);
  assert.ok(queries.every((query) => query.length <= 500));
});

test("Knowledge retrieval broadens uncovered domains without inventing an Interview question", async () => {
  const { buildInterviewKnowledgeQueries } = await importSource("src/features/interview-eslam/knowledge-guidance-core.ts");
  const context = {
    sources: [],
    previousQuestions: [{ id: "q1", question: "Q", topic: "Offer strategy", status: "answered", createdAt: new Date().toISOString() }],
    suppressedTopics: [],
  };
  const queries = buildInterviewKnowledgeQueries(context, { focusTopic: null, coverage: emptyCoverage });
  assert.equal(queries[0], "Offer strategy");
  assert.ok(queries.length <= 3);
  assert.ok(queries.some((query) => /beliefs principles/.test(query)));
});

test("Validated Knowledge sources are inserted before Brain and do not displace prior answers or Business DNA", async () => {
  const { mergeInterviewKnowledgeSources } = await importSource("src/features/interview-eslam/knowledge-guidance-core.ts");
  const context = {
    sources: [
      { id: "interview_answer:a", type: "interview_answer", label: "Answer", content: "answer" },
      { id: "business_dna:offer", type: "business_dna", label: "DNA", content: "dna" },
      { id: "brain:b:v1", type: "brain", label: "Brain", content: "brain" },
    ],
    previousQuestions: [],
    suppressedTopics: [],
  };
  const merged = mergeInterviewKnowledgeSources(context, [knowledgeSource]);
  assert.deepEqual(merged.sources.map((source) => source.type), ["interview_answer", "business_dna", "knowledge_library", "brain"]);
});

test("Grounded Question Contract accepts exact Knowledge excerpts but never treats Knowledge as an Eslam fact", async () => {
  const { parseInterviewQuestionOutput } = await importSource("src/features/interview-eslam/core.ts");
  const context = { sources: [knowledgeSource], previousQuestions: [], suppressedTopics: [] };
  const valid = parseInterviewQuestionOutput(questionOutput(), context);
  assert.equal(valid.ok, true);
  assert.equal(valid.decision, "ask");
  assert.equal(valid.question.groundingSources[0].source_type, "knowledge_library");

  const invalid = parseInterviewQuestionOutput(questionOutput([{ source_id: knowledgeSource.id, fact: "Eslam requires evidence of demand." }]), context);
  assert.deepEqual(invalid, { ok: false, reason: "invalid-known-fact-source" });
});

test("Knowledge-shaped generation explicitly requires Knowledge itself in groundings", async () => {
  const { buildIntelligentInterviewQuestionRequest } = await importSource("src/features/interview-eslam/intelligence-server.ts");
  const context = { sources: [knowledgeSource], previousQuestions: [], suppressedTopics: [] };
  const request = buildIntelligentInterviewQuestionRequest("gpt-5-mini", context, { focusTopic: null, coverage: emptyCoverage });
  assert.match(request.instructions, /knowledge_library material materially shapes the question/);
  assert.match(request.instructions, /must itself appear in groundings/);
  assert.match(request.instructions, /Never use external Knowledge implicitly without grounding it/);
});

test("Persisted grounding detects Knowledge-guided questions without relying on labels", async () => {
  const { hasInterviewKnowledgeGrounding } = await importSource("src/features/interview-eslam/knowledge-guidance-core.ts");
  assert.equal(hasInterviewKnowledgeGrounding([{ source_type: "knowledge_library", source_label: "anything" }]), true);
  assert.equal(hasInterviewKnowledgeGrounding([{ source_type: "brain", source_label: "Knowledge-looking label" }]), false);
  assert.equal(hasInterviewKnowledgeGrounding({ source_type: "knowledge_library" }), false);
});

test("Provider search is bounded and uses the Vector Store Search endpoint", () => {
  const source = readSource("src/features/knowledge-library/openai.ts");
  assert.match(source, /\/vector_stores\/\$\{encodeURIComponent\(vectorStoreId\)\}\/search/);
  assert.match(source, /max_num_results: KNOWLEDGE_VECTOR_SEARCH_MAX_RESULTS/);
  assert.match(source, /rewrite_query: true/);
  assert.match(source, /score_threshold: KNOWLEDGE_VECTOR_SEARCH_SCORE_THRESHOLD/);
  assert.match(source, /OPENAI_KNOWLEDGE_SEARCH_TIMEOUT_MS = 20_000/);
});

test("Interview Knowledge validation reconciles provider metadata against durable ready rows", () => {
  const source = readSource("src/features/interview-eslam/knowledge-guidance.ts");
  assert.match(source, /attributes as \{ source_id\?: unknown \}/);
  assert.match(source, /\.select\("id,title,status,openai_file_id,vector_store_id"\)/);
  assert.match(source, /\.eq\("status", "ready"\)/);
  assert.match(source, /row\.openai_file_id !== candidate\.fileId/);
  assert.match(source, /row\.vector_store_id !== vectorStoreId/);
  assert.match(source, /label: `Knowledge · \$\{row\.title\.trim\(\)\}`/);
  assert.doesNotMatch(source, /filename[^\n]*label/);
});

test("Provider results are locally bounded even if the external API response is malformed or oversized", () => {
  const source = readSource("src/features/interview-eslam/knowledge-guidance.ts");
  assert.match(source, /fileId\.length > 200/);
  assert.match(source, /score > 1/);
  assert.match(source, /result\.content\.slice\(0, 8\)/);
  assert.match(source, /rawResults[\s\S]*\.slice\(0, 12\)/);
  assert.match(source, /INTERVIEW_KNOWLEDGE_MAX_SOURCE_CHARS - text\.length/);
});

test("Question generation retrieves Knowledge before deciding that context is insufficient and degrades safely", () => {
  const actions = readSource("src/features/interview-eslam/actions.ts");
  const guidance = readSource("src/features/interview-eslam/knowledge-guidance.ts");
  assert.match(actions, /loadInterviewQuestionContext[\s\S]*loadInterviewGenerationIntelligence[\s\S]*loadInterviewKnowledgeGuidance\(baseContext, intelligence\)[\s\S]*mergeInterviewKnowledgeSources[\s\S]*if \(!context\.sources\.length\) return "needs-context"/);
  assert.match(guidance, /catch \(error\)[\s\S]*continuing without it[\s\S]*return \[\]/);
});

test("Admin UI marks Knowledge-guided questions without exposing Knowledge source identity", () => {
  const data = readSource("src/features/interview-eslam/data.ts");
  const page = readSource("src/app/admin/teach/interview/page.tsx");
  assert.match(data, /grounding_sources/);
  assert.match(data, /knowledgeGuided: hasInterviewKnowledgeGrounding/);
  assert.match(page, /Knowledge-guided/);
  assert.match(page, /المرجع لا يُعتبر رأي إسلام/);
  assert.doesNotMatch(page, /source_label|source_id|original_filename|openai_file_id/);
});

test("Task 26 remains scoped away from YouTube and Drive ingestion", () => {
  const guidance = readSource("src/features/interview-eslam/knowledge-guidance.ts");
  const actions = readSource("src/features/interview-eslam/actions.ts");
  assert.doesNotMatch(`${guidance}\n${actions}`, /youtube|google[_ -]?drive|google[_ -]?docs/i);
});
