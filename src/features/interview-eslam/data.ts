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
export type InterviewPageState = {
  sessionId: string | null;
  currentQuestion: InterviewCurrentQuestion | null;
  counts: { answered: number; skipped: number; notRelevant: number };
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

function logInterviewLoadError(stage: string, error: { code?: string; message?: string } | null) {
  console.error("Interview Eslam load failed", {
    stage,
    code: error?.code,
    message: error?.message ?? "Unknown Interview Eslam load error",
  });
}
function isQuestionStatus(value: string): value is InterviewQuestionStatus {
  return ["asked", "answered", "skipped", "not_relevant"].includes(value);
}

/** Loads the current persisted Interview Eslam workbench for the authenticated Admin. */
export async function loadInterviewPageState(): Promise<InterviewPageState> {
  const authorization = await requireAdmin();
  const admin = getInterviewAdminClient();
  const empty = (): InterviewPageState => ({
    sessionId: null,
    currentQuestion: null,
    counts: { answered: 0, skipped: 0, notRelevant: 0 },
    extractionIssue: null,
  });
  const { data: session, error: sessionError } = await admin
    .from("interview_sessions")
    .select("id")
    .eq("created_by", authorization.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) {
    logInterviewLoadError("session", sessionError);
    return empty();
  }
  if (!session) return empty();

  const [questionResult, historyResult, extractionResult] = await Promise.all([
    admin.from("interview_questions")
      .select("id,ordinal,question,topic,why_this_question,gap_type,follow_up_recommended,created_at")
      .eq("session_id", session.id).eq("created_by", authorization.userId).eq("status", "asked")
      .limit(1).maybeSingle(),
    admin.from("interview_questions").select("status")
      .eq("session_id", session.id).eq("created_by", authorization.userId).limit(1000),
    admin.from("interview_answers").select("id,extraction_status,extraction_last_error_code,created_at")
      .eq("session_id", session.id).eq("created_by", authorization.userId)
      .in("extraction_status", ["pending", "failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (questionResult.error) logInterviewLoadError("current-question", questionResult.error);
  if (historyResult.error) logInterviewLoadError("history-counts", historyResult.error);
  if (extractionResult.error) logInterviewLoadError("extraction-issue", extractionResult.error);
  const counts = { answered: 0, skipped: 0, notRelevant: 0 };
  if (!historyResult.error) for (const row of historyResult.data ?? []) {
    if (row.status === "answered") counts.answered += 1;
    if (row.status === "skipped") counts.skipped += 1;
    if (row.status === "not_relevant") counts.notRelevant += 1;
  }
  const question = questionResult.error ? null : questionResult.data;
  const extraction = extractionResult.error ? null : extractionResult.data;
  return {
    sessionId: session.id,
    currentQuestion: question ? {
      id: question.id,
      ordinal: question.ordinal,
      question: question.question,
      topic: question.topic,
      whyThisQuestion: question.why_this_question,
      gapType: question.gap_type,
      followUpRecommended: question.follow_up_recommended,
      createdAt: question.created_at,
    } : null,
    counts,
    extractionIssue: extraction && (extraction.extraction_status === "pending" || extraction.extraction_status === "failed")
      ? { answerId: extraction.id, status: extraction.extraction_status, errorCode: extraction.extraction_last_error_code, createdAt: extraction.created_at }
      : null,
  };
}

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
  const results = await Promise.all(items.map(async (item) => {
    const bound = item.status === "published" ? item.published_version_number : item.status === "approved" ? item.approved_version_number : null;
    if (bound !== null) {
      const result = await admin.from("eslam_brain_versions").select("version_number,title,content,summary,topics")
        .eq("item_id", item.id).eq("version_number", bound).maybeSingle();
      return { item, ...result };
    }
    const result = await admin.from("eslam_brain_versions").select("version_number,title,content,summary,topics")
      .eq("item_id", item.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    return { item, ...result };
  }));
  const sources: InterviewGroundingSource[] = [];
  for (const result of results) {
    if (result.error) { logInterviewLoadError(`brain-version:${result.item.id}`, result.error); continue; }
    const version = result.data;
    if (!version || !["draft", "approved", "published"].includes(result.item.status) || !version.title?.trim() || !version.content?.trim()) continue;
    sources.push({
      id: `brain:${result.item.id}:v${version.version_number}`,
      type: "brain",
      label: `${result.item.status} Brain · ${version.title.trim()}`,
      content: [
        `Title: ${version.title.trim()}`,
        `Teaching: ${version.content.trim()}`,
        version.summary?.trim() ? `Summary: ${version.summary.trim()}` : "",
        Array.isArray(version.topics) && version.topics.length ? `Topics: ${version.topics.join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      lifecycleStatus: result.item.status as "draft" | "approved" | "published",
    });
  }
  return sources;
}

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

/** Loads bounded sources and exclusions for the Grounded Question Contract. */
export async function loadInterviewQuestionContext(userId: string): Promise<InterviewQuestionContext> {
  const [businessDnaSources, brainSources, interviewHistory] = await Promise.all([
    loadBusinessDnaSources(userId), loadBrainSources(userId), loadInterviewHistory(userId),
  ]);
  return {
    sources: [...businessDnaSources, ...brainSources, ...interviewHistory.answerSources],
    previousQuestions: interviewHistory.history,
    suppressedTopics: interviewHistory.suppressedTopics,
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
