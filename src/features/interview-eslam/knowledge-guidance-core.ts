import type {
  InterviewGroundingSource,
  InterviewQuestionContext,
} from "./core.ts";
import type { InterviewCoverage } from "./intelligence-core.ts";

export const INTERVIEW_KNOWLEDGE_MAX_QUERIES = 3;
export const INTERVIEW_KNOWLEDGE_MAX_SOURCES = 10;
export const INTERVIEW_KNOWLEDGE_MAX_SOURCE_CHARS = 4_000;

const domainQueries: Record<string, string> = {
  beliefs: "beliefs principles opinions contrarian views philosophy معتقدات مبادئ آراء فلسفة",
  decision_rules: "decision rules exceptions objections client selection criteria قواعد قرار استثناءات اعتراضات اختيار العملاء",
  experience: "examples case studies failures lessons outcomes أمثلة دراسات حالة إخفاقات دروس نتائج",
  systems: "frameworks processes sequence methodology systems أطر عمل عمليات خطوات منهجية أنظمة",
  audience_offer: "audience customer problem offer positioning value proposition جمهور عميل مشكلة عرض تموضع قيمة",
  growth_sales: "acquisition funnels sales marketing conversion growth اكتساب فانلز مبيعات تسويق تحويل نمو",
  other: "business coaching strategy judgment tradeoffs استراتيجية أعمال كوتشنج حكم مفاضلات",
};

type InterviewKnowledgeIntelligence = {
  focusTopic: string | null;
  coverage: InterviewCoverage;
};

/** Adds one normalized retrieval query while preserving stable priority and avoiding duplicates. */
function addQuery(queries: string[], value: string) {
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, 500);
  if (!normalized || queries.includes(normalized) || queries.length >= INTERVIEW_KNOWLEDGE_MAX_QUERIES) return;
  queries.push(normalized);
}

/** Builds bounded retrieval queries from trusted Interview routing state, never from Knowledge content itself. */
export function buildInterviewKnowledgeQueries(
  context: InterviewQuestionContext,
  intelligence: InterviewKnowledgeIntelligence,
) {
  const queries: string[] = [];
  const focus = intelligence.focusTopic?.trim() ?? "";
  if (focus) {
    addQuery(queries, focus);
    addQuery(queries, `${focus} principles decision rules exceptions disagreements مبادئ قواعد قرار استثناءات اختلاف`);
    addQuery(queries, `${focus} examples case studies failures lessons أمثلة حالات إخفاقات دروس`);
    return queries;
  }

  const lastAnsweredTopic = context.previousQuestions
    .slice()
    .reverse()
    .find((question) => question.status === "answered")?.topic;
  if (lastAnsweredTopic) addQuery(queries, lastAnsweredTopic);

  const priorityDomains = [
    ...intelligence.coverage.domains.filter((domain) => !domain.explored),
    ...intelligence.coverage.domains.filter(
      (domain) => domain.deferred > 0 && domain.captured === 0,
    ),
    ...intelligence.coverage.domains.filter((domain) => domain.explored),
  ];
  for (const domain of priorityDomains) {
    addQuery(queries, domainQueries[domain.id] ?? domainQueries.other);
    if (queries.length >= INTERVIEW_KNOWLEDGE_MAX_QUERIES) break;
  }

  if (!queries.length) {
    addQuery(queries, domainQueries.beliefs);
    addQuery(queries, domainQueries.decision_rules);
    addQuery(queries, domainQueries.experience);
  }
  return queries;
}

/** Inserts validated Knowledge sources before Brain so bounded context retains dynamic reference evidence. */
export function mergeInterviewKnowledgeSources(
  context: InterviewQuestionContext,
  knowledgeSources: InterviewGroundingSource[],
): InterviewQuestionContext {
  const boundedKnowledge = knowledgeSources
    .filter((source) => source.type === "knowledge_library")
    .slice(0, INTERVIEW_KNOWLEDGE_MAX_SOURCES);
  if (!boundedKnowledge.length) return context;

  const existingIds = new Set(context.sources.map((source) => source.id));
  const uniqueKnowledge = boundedKnowledge.filter((source) => {
    if (existingIds.has(source.id)) return false;
    existingIds.add(source.id);
    return true;
  });
  if (!uniqueKnowledge.length) return context;

  const firstBrain = context.sources.findIndex((source) => source.type === "brain");
  const insertAt = firstBrain < 0 ? context.sources.length : firstBrain;
  return {
    ...context,
    sources: [
      ...context.sources.slice(0, insertAt),
      ...uniqueKnowledge,
      ...context.sources.slice(insertAt),
    ],
  };
}

/** Detects persisted Knowledge grounding without trusting arbitrary source labels. */
export function hasInterviewKnowledgeGrounding(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((grounding) => {
    if (!grounding || typeof grounding !== "object" || Array.isArray(grounding)) return false;
    return (grounding as { source_type?: unknown }).source_type === "knowledge_library";
  });
}
