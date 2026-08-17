import "server-only";

import {
  BUSINESS_DNA_SELECT,
  businessDnaFieldDefinitions,
  businessDnaValuesFromRow,
  type BusinessDnaRow,
} from "@/features/business-dna/fields";
import {
  INTERVIEW_MAX_PREVIOUS_QUESTIONS,
  type InterviewGroundingSource,
  type InterviewQuestionContext,
  type InterviewQuestionHistoryItem,
  type InterviewQuestionStatus,
} from "@/features/interview-eslam/core";
import {
  buildInterviewCoverage,
  type InterviewCoverage,
  type InterviewCoverageAggregate,
} from "@/features/interview-eslam/intelligence-core";
import { getInterviewAdminClient } from "@/features/interview-eslam/database";
import { requireAdmin } from "@/lib/auth/admin";
import type { Json } from "@/types/database";

export type InterviewCurrentQuestion = {
  id: string;
  ordinal: number;
  question: string;
  topic: string;
  whyThisQuestion: string;
  gapType: string;
  followUpRecommended: boolean;
  createdAt: string;
};
export type InterviewExtractionIssue = {
  answerId: string;
  status: "pending" | "failed";
  errorCode: string | null;
  createdAt: string;
};
export type InterviewHistoryEntry = {
  id: string;
  sessionId: string;
  ordinal: number;
  question: string;
  topic: string;
  gapType: string;
  status: InterviewQuestionStatus;
  createdAt: string;
};
export type InterviewSessionSummary = {
  id: string;
  status: string;
  focusTopic: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
export type InterviewPageState = {
  sessionId: string | null;
  activeSession: InterviewSessionSummary | null;
  currentQuestion: InterviewCurrentQuestion | null;
  counts: { answered: number; skipped: number; notRelevant: number };
  analytics: {
    answered: number;
    skipped: number;
    notRelevant: number;
    distinctAnsweredTopics: number;
    sessions: number;
    completedSessions: number;
    exploredDomains: number;
    totalDomains: number;
  };
  coverage: InterviewCoverage;
  recentHistory: InterviewHistoryEntry[];
  recentSessions: InterviewSessionSummary[];
  extractionIssue: InterviewExtractionIssue | null;
};
type BrainItemRow = {
  id: string;
  semantic_layer: string;
  item_type: string;
  status: string;
  priority: number;
  approved_version_number: number | null;
  published_version_number: number | null;
};
type BrainVersionRow = {
  item_id: string;
  version_number: number;
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
};
type ParsedInterviewStats = {
  answered: number;
  skipped: number;
  notRelevant: number;
  distinctAnsweredTopics: number;
  sessions: number;
  completedSessions: number;
  aggregates: InterviewCoverageAggregate[];
};

/** Logs bounded diagnostic metadata for Interview Eslam data-load failures. */
function logInterviewLoadError(stage: string, error: { code?: string; message?: string } | null) {
  console.error("Interview Eslam load failed", {
    stage,
    code: error?.code,
    message: error?.message ?? "Unknown Interview Eslam load error",
  });
}

/** Narrows persisted strings to supported interview-question lifecycle states. */
function isQuestionStatus(value: string): value is InterviewQuestionStatus {
  return ["asked", "answered", "skipped", "not_relevant"].includes(value);
}

/** Parses the service-only aggregate RPC without trusting malformed database JSON. */
function parseInterviewStats(value: Json | null): ParsedInterviewStats {
  const empty: ParsedInterviewStats = {
    answered: 0,
    skipped: 0,
    notRelevant: 0,
    distinctAnsweredTopics: 0,
    sessions: 0,
    completedSessions: 0,
    aggregates: [],
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const record = value as Record<string, Json | undefined>;
  const integer = (key: string) => {
    const candidate = record[key];
    return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  };
  const rawAggregates = record.gap_status_counts;
  const aggregates: InterviewCoverageAggregate[] = [];
  if (Array.isArray(rawAggregates)) {
    for (const raw of rawAggregates) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const item = raw as Record<string, Json | undefined>;
      if (typeof item.gap_type !== "string" || typeof item.status !== "string" || typeof item.count !== "number") continue;
      if (!Number.isSafeInteger(item.count) || item.count <= 0) continue;
      aggregates.push({ gapType: item.gap_type, status: item.status, count: item.count });
    }
  }
  return {
    answered: integer("answered_count"),
    skipped: integer("skipped_count"),
    notRelevant: integer("not_relevant_count"),
    distinctAnsweredTopics: integer("distinct_answered_topics"),
    sessions: integer("session_count"),
    completedSessions: integer("completed_session_count"),
    aggregates,
  };
}

/** Maps a persisted session row into stable Admin UI data. */
function sessionSummary(row: {
  id: string; status: string; focus_topic: string | null; created_at: string; updated_at: string; completed_at: string | null;
}): InterviewSessionSummary {
  return {
    id: row.id,
    status: row.status,
    focusTopic: row.focus_topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/** Loads the current workbench plus exact aggregate progress and recent Interview history. */
export async function loadInterviewPageState(): Promise<InterviewPageState> {
  const authorization = await requireAdmin();
  const userId = authorization.userId;
  const admin = getInterviewAdminClient();
  const [sessionResult, statsResult, sessionsResult, recentQuestionsResult] = await Promise.all([
    admin.from("interview_sessions")
      .select("id,status,focus_topic,created_at,updated_at,completed_at")
      .eq("created_by", userId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.rpc("get_interview_intelligence_stats", { p_created_by: userId }),
    admin.from("interview_sessions")
      .select("id,status,focus_topic,created_at,updated_at,completed_at")
      .eq("created_by", userId).order("created_at", { ascending: false }).limit(8),
    admin.from("interview_questions")
      .select("id,session_id,ordinal,question,topic,gap_type,status,created_at")
      .eq("created_by", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(24),
  ]);
  if (sessionResult.error) logInterviewLoadError("session", sessionResult.error);
  if (statsResult.error) logInterviewLoadError("intelligence-stats", statsResult.error);
  if (sessionsResult.error) logInterviewLoadError("session-history", sessionsResult.error);
  if (recentQuestionsResult.error) logInterviewLoadError("question-history-ui", recentQuestionsResult.error);

  const stats = parseInterviewStats(statsResult.error ? null : statsResult.data);
  const coverage = buildInterviewCoverage(stats.aggregates);
  const activeSession = sessionResult.error || !sessionResult.data ? null : sessionSummary(sessionResult.data);
  const recentSessions = sessionsResult.error ? [] : (sessionsResult.data ?? []).map(sessionSummary);
  const recentHistory: InterviewHistoryEntry[] = (recentQuestionsResult.error ? [] : recentQuestionsResult.data ?? [])
    .filter((row) => isQuestionStatus(row.status))
    .map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      ordinal: row.ordinal,
      question: row.question,
      topic: row.topic,
      gapType: row.gap_type,
      status: row.status as InterviewQuestionStatus,
      createdAt: row.created_at,
    }));

  let currentQuestion: InterviewCurrentQuestion | null = null;
  let extractionIssue: InterviewExtractionIssue | null = null;
  const counts = { answered: 0, skipped: 0, notRelevant: 0 };
  if (activeSession) {
    const [questionResult, historyResult, extractionResult] = await Promise.all([
      admin.from("interview_questions")
        .select("id,ordinal,question,topic,why_this_question,gap_type,follow_up_recommended,created_at")
        .eq("session_id", activeSession.id).eq("created_by", userId).eq("status", "asked")
        .limit(1).maybeSingle(),
      admin.from("interview_questions").select("status")
        .eq("session_id", activeSession.id).eq("created_by", userId).limit(1000),
      admin.from("interview_answers").select("id,extraction_status,extraction_last_error_code,created_at")
        .eq("session_id", activeSession.id).eq("created_by", userId)
        .in("extraction_status", ["pending", "failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (questionResult.error) logInterviewLoadError("current-question", questionResult.error);
    if (historyResult.error) logInterviewLoadError("history-counts", historyResult.error);
    if (extractionResult.error) logInterviewLoadError("extraction-issue", extractionResult.error);
    if (!historyResult.error) for (const row of historyResult.data ?? []) {
      if (row.status === "answered") counts.answered += 1;
      if (row.status === "skipped") counts.skipped += 1;
      if (row.status === "not_relevant") counts.notRelevant += 1;
    }
    const question = questionResult.error ? null : questionResult.data;
    if (question) {
      currentQuestion = {
        id: question.id,
        ordinal: question.ordinal,
        question: question.question,
        topic: question.topic,
        whyThisQuestion: question.why_this_question,
        gapType: question.gap_type,
        followUpRecommended: question.follow_up_recommended,
        createdAt: question.created_at,
      };
    }
    const extraction = extractionResult.error ? null : extractionResult.data;
    if (extraction && (extraction.extraction_status === "pending" || extraction.extraction_status === "failed")) {
      extractionIssue = {
        answerId: extraction.id,
        status: extraction.extraction_status,
        errorCode: extraction.extraction_last_error_code,
        createdAt: extraction.created_at,
      };
    }
  }

  return {
    sessionId: activeSession?.id ?? null,
    activeSession,
    currentQuestion,
    counts,
    analytics: {
      answered: stats.answered,
      skipped: stats.skipped,
      notRelevant: stats.notRelevant,
      distinctAnsweredTopics: stats.distinctAnsweredTopics,
      sessions: stats.sessions,
      completedSessions: stats.completedSessions,
      exploredDomains: coverage.exploredCount,
      totalDomains: coverage.totalCount,
    },
    coverage,
    recentHistory,
    recentSessions,
    extractionIssue,
  };
}

/** Loads non-empty Business DNA fields as exact grounding sources. */
async function loadBusinessDnaSources(userId: string): Promise<InterviewGroundingSource[]> {
  const admin = getInterviewAdminClient();
  const { data, error } = await admin.from("business_dna").select(BUSINESS_DNA_SELECT).eq("user_id", userId).maybeSingle();
  if (error) { logInterviewLoadError("business-dna-context", error); return []; }
  const values = businessDnaValuesFromRow(data as BusinessDnaRow | null);
  return businessDnaFieldDefinitions.flatMap((definition) => {
    const content = values[definition.name].trim();
    return content ? [{ id: `business_dna:${definition.name}`, type: "business_dna" as const, label: `Business DNA · ${definition.label}`, content }] : [];
  });
}

/** Loads prioritized Brain items and resolves all required versions in one batched query. */
async function loadBrainSources(userId: string): Promise<InterviewGroundingSource[]> {
  const admin = getInterviewAdminClient();
  const { data, error } = await admin.from("eslam_brain_items")
    .select("id,semantic_layer,item_type,status,priority,approved_version_number,published_version_number")
    .eq("created_by", userId).in("status", ["draft", "approved", "published"])
    .order("priority", { ascending: true }).order("id", { ascending: true }).limit(80);
  if (error) { logInterviewLoadError("brain-context", error); return []; }
  const rank: Record<string, number> = { published: 0, approved: 1, draft: 2 };
  const items = ((data ?? []) as BrainItemRow[]).sort((a, b) =>
    (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.priority - b.priority || a.id.localeCompare(b.id));
  if (!items.length) return [];

  const { data: versionsData, error: versionsError } = await admin.from("eslam_brain_versions")
    .select("item_id,version_number,title,content,summary,topics")
    .in("item_id", items.map((item) => item.id))
    .order("version_number", { ascending: false });
  if (versionsError) { logInterviewLoadError("brain-versions", versionsError); return []; }

  const versionsByItem = new Map<string, BrainVersionRow[]>();
  for (const version of (versionsData ?? []) as BrainVersionRow[]) {
    const versions = versionsByItem.get(version.item_id);
    if (versions) versions.push(version);
    else versionsByItem.set(version.item_id, [version]);
  }

  const sources: InterviewGroundingSource[] = [];
  for (const item of items) {
    const bound = item.status === "published"
      ? item.published_version_number
      : item.status === "approved"
        ? item.approved_version_number
        : null;
    const versions = versionsByItem.get(item.id) ?? [];
    const version = bound !== null
      ? versions.find((candidate) => candidate.version_number === bound) ?? null
      : versions[0] ?? null;
    if (!version || !version.title?.trim() || !version.content?.trim()) continue;
    sources.push({
      id: `brain:${item.id}:v${version.version_number}`,
      type: "brain",
      label: `${item.status} Brain · ${version.title.trim()}`,
      content: [
        `Title: ${version.title.trim()}`,
        `Teaching: ${version.content.trim()}`,
        version.summary?.trim() ? `Summary: ${version.summary.trim()}` : "",
        Array.isArray(version.topics) && version.topics.length ? `Topics: ${version.topics.join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      lifecycleStatus: item.status as "draft" | "approved" | "published",
    });
  }
  return sources;
}

/** Loads prior interview questions, answer evidence, and durable topic suppressions. */
async function loadInterviewHistory(userId: string) {
  const admin = getInterviewAdminClient();
  const { data: questions, error: questionsError } = await admin.from("interview_questions")
    .select("id,question,topic,status,created_at").eq("created_by", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(INTERVIEW_MAX_PREVIOUS_QUESTIONS);
  if (questionsError) logInterviewLoadError("question-history", questionsError);
  const history: InterviewQuestionHistoryItem[] = (questionsError ? [] : questions ?? []).slice().reverse()
    .filter((row) => isQuestionStatus(row.status)).map((row) => ({
      id: row.id, question: row.question, topic: row.topic, status: row.status as InterviewQuestionStatus, createdAt: row.created_at,
    }));
  const questionById = new Map(history.map((item) => [item.id, item] as const));
  const [answersResult, suppressionsResult] = await Promise.all([
    admin.from("interview_answers").select("id,question_id,answer_text,created_at").eq("created_by", userId)
      .order("created_at", { ascending: false }).limit(24),
    admin.from("interview_topic_suppressions").select("topic_key,topic_label").eq("created_by", userId)
      .order("created_at", { ascending: true }).limit(200),
  ]);
  if (answersResult.error) logInterviewLoadError("answer-context", answersResult.error);
  if (suppressionsResult.error) logInterviewLoadError("topic-suppressions", suppressionsResult.error);
  const answerSources: InterviewGroundingSource[] = (answersResult.error ? [] : answersResult.data ?? []).slice().reverse().map((answer) => {
    const question = questionById.get(answer.question_id);
    return { id: `interview_answer:${answer.id}`, type: "interview_answer" as const, label: question ? `Interview answer · ${question.topic}` : "Previous Interview Eslam answer", content: answer.answer_text };
  });
  return {
    history,
    answerSources,
    suppressedTopics: (suppressionsResult.error ? [] : suppressionsResult.data ?? []).map((row) => ({ topicKey: row.topic_key, topicLabel: row.topic_label })),
  };
}

/** Loads ordered sources and exclusions for the Grounded Question Contract. */
export async function loadInterviewQuestionContext(userId: string): Promise<InterviewQuestionContext> {
  const [businessDnaSources, brainSources, interviewHistory] = await Promise.all([
    loadBusinessDnaSources(userId), loadBrainSources(userId), loadInterviewHistory(userId),
  ]);
  return {
    sources: [...interviewHistory.answerSources, ...businessDnaSources, ...brainSources],
    previousQuestions: interviewHistory.history,
    suppressedTopics: interviewHistory.suppressedTopics,
  };
}

/** Loads session focus and exact coverage aggregates used only to prioritize grounded candidate generation. */
export async function loadInterviewGenerationIntelligence(userId: string, sessionId: string) {
  const admin = getInterviewAdminClient();
  const [sessionResult, statsResult] = await Promise.all([
    admin.from("interview_sessions").select("focus_topic").eq("id", sessionId).eq("created_by", userId).eq("status", "active").maybeSingle(),
    admin.rpc("get_interview_intelligence_stats", { p_created_by: userId }),
  ]);
  if (sessionResult.error) logInterviewLoadError("generation-focus", sessionResult.error);
  if (statsResult.error) logInterviewLoadError("generation-stats", statsResult.error);
  const stats = parseInterviewStats(statsResult.error ? null : statsResult.data);
  return {
    focusTopic: sessionResult.error ? null : sessionResult.data?.focus_topic ?? null,
    coverage: buildInterviewCoverage(stats.aggregates),
  };
}

export type InterviewAnswerForExtraction = { id: string; questionId: string; question: string; answer: string; extractionStatus: string };

/** Loads one owner-scoped raw answer and its immutable question for extraction/retry. */
export async function loadInterviewAnswerForExtraction(answerId: string, userId: string): Promise<InterviewAnswerForExtraction | null> {
  const admin = getInterviewAdminClient();
  const { data: answer, error: answerError } = await admin.from("interview_answers")
    .select("id,question_id,answer_text,extraction_status").eq("id", answerId).eq("created_by", userId).maybeSingle();
  if (answerError || !answer) { if (answerError) logInterviewLoadError(`answer:${answerId}`, answerError); return null; }
  const { data: question, error: questionError } = await admin.from("interview_questions")
    .select("id,question").eq("id", answer.question_id).eq("created_by", userId).maybeSingle();
  if (questionError || !question) { if (questionError) logInterviewLoadError(`answer-question:${answerId}`, questionError); return null; }
  return { id: answer.id, questionId: question.id, question: question.question, answer: answer.answer_text, extractionStatus: answer.extraction_status };
}

/** Converts validated question metadata to the JSON payload persisted by the transaction RPC. */
export function interviewQuestionPayloadToJson(input: {
  question: string; topic: string; topicKey: string; whyThisQuestion: string; gapType: string;
  groundingSources: unknown; relevantKnownFacts: unknown; followUpRecommended: boolean;
  questionFingerprint: string; model: string; promptVersion: number;
}): Json {
  return {
    question: input.question,
    topic: input.topic,
    topic_key: input.topicKey,
    why_this_question: input.whyThisQuestion,
    gap_type: input.gapType,
    grounding_sources: input.groundingSources as Json,
    relevant_known_facts: input.relevantKnownFacts as Json,
    follow_up_recommended: input.followUpRecommended,
    question_fingerprint: input.questionFingerprint,
    model: input.model,
    prompt_version: input.promptVersion,
  };
}
