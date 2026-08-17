import {
  INTERVIEW_GAP_TYPES,
  areInterviewTopicsLikelySimilar,
  type InterviewGapType,
  type InterviewQuestionHistoryItem,
} from "./core.ts";

export const INTERVIEW_INTELLIGENCE_PROMPT_VERSION = 2;
export const INTERVIEW_SEMANTIC_DUPLICATE_THRESHOLD = 0.88;
export const INTERVIEW_SEMANTIC_HISTORY_LIMIT = 80;
export const INTERVIEW_MAX_FOCUS_CHARS = 120;

export const INTERVIEW_COVERAGE_DOMAINS = [
  { id: "beliefs", label: "المعتقدات والآراء" },
  { id: "decision_rules", label: "قواعد القرار والاستثناءات" },
  { id: "experience", label: "الأمثلة والخبرة العملية" },
  { id: "systems", label: "الـ Frameworks والعمليات" },
  { id: "audience_offer", label: "الجمهور والعروض" },
  { id: "growth_sales", label: "الاكتساب والفانلز والمبيعات" },
  { id: "other", label: "فجوات أخرى" },
] as const;

export type InterviewCoverageDomainId = (typeof INTERVIEW_COVERAGE_DOMAINS)[number]["id"];
export type InterviewCoverageAggregate = {
  gapType: string;
  status: string;
  count: number;
};
export type InterviewCoverageDomain = {
  id: InterviewCoverageDomainId;
  label: string;
  captured: number;
  deferred: number;
  excluded: number;
  open: number;
  explored: boolean;
};
export type InterviewCoverage = {
  domains: InterviewCoverageDomain[];
  exploredCount: number;
  totalCount: number;
};

const gapTypeToDomain: Record<InterviewGapType, InterviewCoverageDomainId> = {
  missing_belief: "beliefs",
  missing_decision_rule: "decision_rules",
  missing_exception: "decision_rules",
  missing_example: "experience",
  missing_case_study: "experience",
  ambiguous_framework: "systems",
  unclear_process: "systems",
  incomplete_audience_understanding: "audience_offer",
  incomplete_offer_strategy: "audience_offer",
  incomplete_acquisition_philosophy: "growth_sales",
  incomplete_funnel_philosophy: "growth_sales",
  incomplete_sales_philosophy: "growth_sales",
  missing_objection_principle: "decision_rules",
  missing_client_selection_rule: "decision_rules",
  missing_failure_lesson: "experience",
  missing_contrarian_opinion: "beliefs",
  contradiction: "beliefs",
  missing_eslam_opinion: "beliefs",
  other_grounded_gap: "other",
};
const validGapTypes = new Set<string>(INTERVIEW_GAP_TYPES);

/** Validates an optional Admin focus without turning it into grounding evidence. */
export function validateInterviewFocus(value: unknown) {
  if (typeof value !== "string") return null;
  const focus = value.trim();
  if (!focus) return "";
  return focus.length <= INTERVIEW_MAX_FOCUS_CHARS ? focus : null;
}

/** Computes cosine similarity for finite embedding vectors with equal dimensions. */
export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm <= 0 || rightNorm <= 0) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

/** Finds the strongest semantic duplicate above the configured similarity threshold. */
export function findSemanticDuplicateIndex(
  candidateEmbedding: number[],
  previousEmbeddings: number[][],
  threshold = INTERVIEW_SEMANTIC_DUPLICATE_THRESHOLD,
) {
  let bestIndex = -1;
  let bestScore = -1;
  previousEmbeddings.forEach((embedding, index) => {
    const score = cosineSimilarity(candidateEmbedding, embedding);
    if (score !== null && score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex >= 0 && bestScore >= threshold ? { index: bestIndex, score: bestScore } : null;
}

/** Builds a factual domain-coverage map from persisted aggregate interview outcomes. */
export function buildInterviewCoverage(aggregates: InterviewCoverageAggregate[]): InterviewCoverage {
  const domains = INTERVIEW_COVERAGE_DOMAINS.map((domain) => ({
    ...domain,
    captured: 0,
    deferred: 0,
    excluded: 0,
    open: 0,
    explored: false,
  }));
  const byId = new Map(domains.map((domain) => [domain.id, domain] as const));

  for (const aggregate of aggregates) {
    if (!validGapTypes.has(aggregate.gapType) || !Number.isInteger(aggregate.count) || aggregate.count <= 0) continue;
    const domainId = gapTypeToDomain[aggregate.gapType as InterviewGapType];
    const domain = byId.get(domainId);
    if (!domain) continue;
    if (aggregate.status === "answered") domain.captured += aggregate.count;
    else if (aggregate.status === "skipped") domain.deferred += aggregate.count;
    else if (aggregate.status === "not_relevant") domain.excluded += aggregate.count;
    else if (aggregate.status === "asked") domain.open += aggregate.count;
  }

  for (const domain of domains) {
    domain.explored = domain.captured + domain.deferred + domain.excluded + domain.open > 0;
  }
  return {
    domains,
    exploredCount: domains.filter((domain) => domain.explored).length,
    totalCount: domains.length,
  };
}

/** Prevents immediate skip repeats and unbounded same-topic drill-down outside explicit focus mode. */
export function shouldRejectInterviewTopicSequence(
  candidateTopic: string,
  previousQuestions: InterviewQuestionHistoryItem[],
  focusTopic?: string | null,
) {
  const recent = previousQuestions.slice(-2);
  const last = recent.at(-1);
  if (last?.status === "skipped" && areInterviewTopicsLikelySimilar(candidateTopic, last.topic)) return true;

  const focused = Boolean(focusTopic?.trim() && areInterviewTopicsLikelySimilar(candidateTopic, focusTopic));
  if (focused || recent.length < 2) return false;
  return recent.every((item) => areInterviewTopicsLikelySimilar(candidateTopic, item.topic));
}

/** Produces trusted prioritization instructions; focus and coverage guide selection but never establish facts. */
export function buildInterviewIntelligenceDirective(focusTopic: string | null, coverage: InterviewCoverage) {
  const unexplored = coverage.domains.filter((domain) => !domain.explored).map((domain) => domain.label);
  const deferred = coverage.domains
    .filter((domain) => domain.deferred > 0 && domain.captured === 0)
    .map((domain) => domain.label);
  const focusInstruction = focusTopic
    ? `The Admin explicitly focused this session on "${focusTopic}". Prioritize only gaps materially within that focus. The focus text is routing metadata, not evidence and never satisfies grounding. If supplied sources cannot ground a useful question inside the focus, return needs_context.`
    : "No explicit session focus is set. Prefer a high-value grounded gap that broadens coverage instead of repeatedly drilling the same topic.";
  const coverageInstruction = [
    unexplored.length ? `Unexplored coverage domains: ${unexplored.join(", ")}.` : "All tracked coverage domains have been explored at least once.",
    deferred.length ? `Domains deferred without a captured answer include: ${deferred.join(", ")}. Do not immediately repeat a skipped question; revisit only through materially different grounding.` : "No domain is currently deferred without any captured answer.",
  ].join(" ");
  return `${focusInstruction} ${coverageInstruction} Never claim that domain coverage means Eslam is fully learned or complete.`;
}
