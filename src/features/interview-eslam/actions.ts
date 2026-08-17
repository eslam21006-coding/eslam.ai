"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildInterviewTeachingRequest,
  INTERVIEW_EXTRACTION_LEASE_SECONDS,
  INTERVIEW_EXTRACTION_PROMPT_VERSION,
  isInterviewUuid,
  normalizeInterviewTopicKey,
  parseInterviewQuestionOutput,
  parseInterviewTeachingCandidates,
  validateInterviewAnswer,
} from "@/features/interview-eslam/core";
import {
  INTERVIEW_INTELLIGENCE_PROMPT_VERSION,
  shouldRejectInterviewTopicSequence,
  validateInterviewFocus,
} from "@/features/interview-eslam/intelligence-core";
import {
  buildIntelligentInterviewQuestionRequest,
  findSemanticInterviewDuplicate,
} from "@/features/interview-eslam/intelligence-server";
import {
  interviewQuestionPayloadToJson,
  loadInterviewAnswerForExtraction,
  loadInterviewGenerationIntelligence,
  loadInterviewQuestionContext,
} from "@/features/interview-eslam/data";
import { getInterviewAdminClient } from "@/features/interview-eslam/database";
import { requireAdmin } from "@/lib/auth/admin";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai/client";
import type { Json } from "@/types/database";

const INTERVIEW_PATH = "/admin/teach/interview";
const BRAIN_PATH = "/admin/brain";
const TEACH_PATH = "/admin/teach";
const MAX_QUESTION_GENERATION_ATTEMPTS = 2;
type NextQuestionResult = "ready" | "needs-context" | "exhausted" | "failed";
type ExtractionResult =
  | { ok: true; state: "completed" | "busy"; createdCount: number }
  | { ok: false; error: "not-found" | "openai" | "invalid-output" | "save-failed" };

/** Redirects back to the Interview Eslam workbench with a bounded status notice. */
function redirectToInterview(notice: string, extras: Record<string, string | number | undefined> = {}): never {
  const params = new URLSearchParams({ notice });
  for (const [key, value] of Object.entries(extras)) if (value !== undefined) params.set(key, String(value));
  redirect(`${INTERVIEW_PATH}?${params.toString()}`);
}

/** Reduces unknown runtime errors to safe diagnostic metadata for server logs. */
function errorSummary(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      message: typeof candidate.message === "string" ? candidate.message : "Unknown Interview Eslam error",
    };
  }
  return { message: "Unknown Interview Eslam error" };
}

/** Persists a fenced extraction failure without replacing the durable raw answer. */
async function failInterviewExtraction(answerId: string, userId: string, claimToken: string, errorCode: string) {
  const admin = getInterviewAdminClient();
  try {
    const { data, error } = await admin.rpc("fail_interview_answer_extraction", {
      p_answer_id: answerId, p_created_by: userId, p_claim_token: claimToken, p_error_code: errorCode,
    });
    if (error || data !== true) console.error("Interview answer extraction failure state could not be persisted", { answerId, errorCode, ...errorSummary(error) });
  } catch (error) {
    console.error("Interview answer extraction failure RPC threw", { answerId, errorCode, ...errorSummary(error) });
  }
}

/** Creates one grounded, coverage-aware, semantically non-duplicate question when none is open. */
async function ensureNextInterviewQuestion(sessionId: string, userId: string): Promise<NextQuestionResult> {
  const admin = getInterviewAdminClient();
  const { data: existing, error: existingError } = await admin.from("interview_questions").select("id")
    .eq("session_id", sessionId).eq("created_by", userId).eq("status", "asked").limit(1).maybeSingle();
  if (existingError) {
    console.error("Interview current-question check failed", { sessionId, ...errorSummary(existingError) });
    return "failed";
  }
  if (existing) return "ready";
  const [context, intelligence] = await Promise.all([
    loadInterviewQuestionContext(userId),
    loadInterviewGenerationIntelligence(userId, sessionId),
  ]);
  if (!context.sources.length) return "needs-context";
  const model = getOpenAIModel();
  let rejectionReason: string | undefined;
  for (let attempt = 0; attempt < MAX_QUESTION_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const response = await getOpenAIClient().responses.create(
        buildIntelligentInterviewQuestionRequest(model, context, intelligence, rejectionReason),
      );
      if (response.status === "incomplete") { rejectionReason = "model output was incomplete"; continue; }
      const parsed = parseInterviewQuestionOutput(response.output_text, context);
      if (!parsed.ok) { rejectionReason = parsed.reason; continue; }
      if (parsed.decision === "needs_context") return "needs-context";
      const question = parsed.question;
      if (shouldRejectInterviewTopicSequence(question.topic, context.previousQuestions, intelligence.focusTopic)) {
        rejectionReason = "candidate repeats a recently deferred topic or drills the same topic too many times";
        continue;
      }
      const semanticDuplicate = await findSemanticInterviewDuplicate(question.question, context);
      if (semanticDuplicate) {
        rejectionReason = `candidate is semantically too similar to prior question ${semanticDuplicate.priorQuestionId ?? "unknown"} (${semanticDuplicate.score.toFixed(3)})`;
        continue;
      }
      const { data: questionId, error: insertError } = await admin.rpc("record_interview_question", {
        p_session_id: sessionId,
        p_created_by: userId,
        p_payload: interviewQuestionPayloadToJson({
          question: question.question,
          topic: question.topic,
          topicKey: question.topicKey,
          whyThisQuestion: question.whyThisQuestion,
          gapType: question.gapType,
          groundingSources: question.groundingSources,
          relevantKnownFacts: question.relevantKnownFacts,
          followUpRecommended: question.followUpRecommended,
          questionFingerprint: question.questionFingerprint,
          model,
          promptVersion: INTERVIEW_INTELLIGENCE_PROMPT_VERSION,
        }),
      });
      if (insertError || !isInterviewUuid(questionId)) {
        const summary = errorSummary(insertError);
        if (summary.code === "23505") { rejectionReason = "question duplicates a previously persisted interview question"; continue; }
        console.error("Interview grounded question persistence failed", { sessionId, ...summary });
        return "failed";
      }
      return "ready";
    } catch (error) {
      console.error("Interview grounded question generation failed", { sessionId, model, attempt: attempt + 1, ...errorSummary(error) });
      return "failed";
    }
  }
  return "exhausted";
}

/** Extracts one saved answer into ordinary Brain drafts under a fenced retryable claim. */
async function extractInterviewAnswer(answerId: string, userId: string): Promise<ExtractionResult> {
  const admin = getInterviewAdminClient();
  const model = getOpenAIModel();
  const { data: claims, error: claimError } = await admin.rpc("claim_interview_answer_extraction", {
    p_answer_id: answerId,
    p_created_by: userId,
    p_model: model,
    p_prompt_version: INTERVIEW_EXTRACTION_PROMPT_VERSION,
    p_lease_seconds: INTERVIEW_EXTRACTION_LEASE_SECONDS,
  });
  if (claimError) {
    console.error("Interview answer extraction claim failed", { answerId, ...errorSummary(claimError) });
    return { ok: false, error: "save-failed" };
  }
  const claim = claims?.[0] ?? null;
  if (!claim || claim.claim_state === "not_found") return { ok: false, error: "not-found" };
  if (claim.claim_state === "completed") {
    const { count } = await admin.from("interview_answer_teachings").select("brain_item_id", { count: "exact", head: true })
      .eq("answer_id", answerId).eq("created_by", userId);
    return { ok: true, state: "completed", createdCount: count ?? 0 };
  }
  if (claim.claim_state === "busy") return { ok: true, state: "busy", createdCount: 0 };
  if (claim.claim_state !== "claimed" || !claim.claim_token || claim.answer_id !== answerId) {
    console.error("Interview answer extraction returned invalid claim state", { answerId, state: claim.claim_state });
    return { ok: false, error: "save-failed" };
  }
  const claimToken = claim.claim_token;
  const source = await loadInterviewAnswerForExtraction(answerId, userId);
  if (!source) {
    await failInterviewExtraction(answerId, userId, claimToken, "source-not-found");
    return { ok: false, error: "not-found" };
  }
  try {
    const response = await getOpenAIClient().responses.create(buildInterviewTeachingRequest(model, source.question, source.answer));
    if (response.status === "incomplete") {
      await failInterviewExtraction(answerId, userId, claimToken, "openai-truncated");
      return { ok: false, error: "openai" };
    }
    const parsed = parseInterviewTeachingCandidates(response.output_text, source.answer);
    if (!parsed.ok) {
      await failInterviewExtraction(answerId, userId, claimToken, parsed.reason);
      return { ok: false, error: "invalid-output" };
    }
    const { data: created, error: completeError } = await admin.rpc("complete_interview_answer_extraction", {
      p_answer_id: answerId,
      p_created_by: userId,
      p_claim_token: claimToken,
      p_candidates: parsed.candidates as unknown as Json,
    });
    if (completeError || !Array.isArray(created)) {
      console.error("Interview teaching draft materialization failed", { answerId, ...errorSummary(completeError) });
      await failInterviewExtraction(answerId, userId, claimToken, "draft-materialization");
      return { ok: false, error: "save-failed" };
    }
    if (created.some((row) => !Number.isInteger(row.candidate_ordinal) || row.candidate_ordinal <= 0 || !isInterviewUuid(row.brain_item_id))) {
      console.error("Interview teaching draft materialization returned invalid rows", { answerId });
      return { ok: false, error: "save-failed" };
    }
    revalidatePath(BRAIN_PATH);
    revalidatePath(TEACH_PATH);
    return { ok: true, state: "completed", createdCount: created.length };
  } catch (error) {
    console.error("Interview answer OpenAI extraction failed", { answerId, model, ...errorSummary(error) });
    await failInterviewExtraction(answerId, userId, claimToken, "openai-extraction");
    return { ok: false, error: "openai" };
  }
}

/** Starts or resumes the active interview and asks its next intelligent grounded question. */
export async function startInterviewAction() {
  const authorization = await requireAdmin();
  const admin = getInterviewAdminClient();
  const { data: sessionId, error } = await admin.rpc("start_interview_session", { p_created_by: authorization.userId });
  if (error || !isInterviewUuid(sessionId)) {
    console.error("Interview session start failed", errorSummary(error));
    redirectToInterview("start-failed");
  }
  const next = await ensureNextInterviewQuestion(sessionId, authorization.userId);
  revalidatePath(INTERVIEW_PATH);
  redirectToInterview(next === "ready" ? "started" : next);
}

/** Persists the raw answer first, then independently extracts drafts and prepares the next question. */
export async function saveInterviewAnswerAction(formData: FormData) {
  const authorization = await requireAdmin();
  const questionId = formData.get("question_id");
  const answer = validateInterviewAnswer(formData.get("answer"));
  if (!isInterviewUuid(questionId) || !answer) redirectToInterview("answer-invalid");
  const admin = getInterviewAdminClient();
  const { data: rows, error } = await admin.rpc("submit_interview_answer", {
    p_question_id: questionId, p_created_by: authorization.userId, p_answer_text: answer,
  });
  const saved = rows?.[0] ?? null;
  if (error || !saved || !isInterviewUuid(saved.answer_id) || !isInterviewUuid(saved.session_id)) {
    console.error("Interview answer persistence failed", { questionId, ...errorSummary(error) });
    redirectToInterview("answer-failed");
  }
  const [extraction, next] = await Promise.all([
    extractInterviewAnswer(saved.answer_id, authorization.userId),
    ensureNextInterviewQuestion(saved.session_id, authorization.userId),
  ]);
  revalidatePath(INTERVIEW_PATH);
  if (!extraction.ok && next !== "ready") redirectToInterview("answer-saved-partial", { next });
  if (!extraction.ok) redirectToInterview("answer-saved-extraction-failed");
  if (next !== "ready") {
    const notice = next === "needs-context"
      ? "answer-saved-needs-context"
      : next === "exhausted"
        ? "answer-saved-exhausted"
        : "answer-saved-next-failed";
    redirectToInterview(notice, { count: extraction.createdCount });
  }
  redirectToInterview("answer-saved", { count: extraction.createdCount });
}

/** Skips the current question but preserves it in duplicate-exclusion history. */
export async function skipInterviewQuestionAction(formData: FormData) {
  const authorization = await requireAdmin();
  const questionId = formData.get("question_id");
  if (!isInterviewUuid(questionId)) redirectToInterview("question-invalid");
  const admin = getInterviewAdminClient();
  const { data: sessionId, error } = await admin.rpc("resolve_interview_question", {
    p_question_id: questionId, p_created_by: authorization.userId, p_resolution: "skipped", p_suppress_topic: false,
  });
  if (error || !isInterviewUuid(sessionId)) {
    console.error("Interview question skip failed", { questionId, ...errorSummary(error) });
    redirectToInterview("question-failed");
  }
  const next = await ensureNextInterviewQuestion(sessionId, authorization.userId);
  revalidatePath(INTERVIEW_PATH);
  redirectToInterview(next === "ready" ? "skipped" : next);
}

/** Marks a question irrelevant and optionally persists cross-session topic suppression. */
export async function notRelevantInterviewQuestionAction(formData: FormData) {
  const authorization = await requireAdmin();
  const questionId = formData.get("question_id");
  const suppressTopic = formData.get("suppress_topic") === "on";
  if (!isInterviewUuid(questionId)) redirectToInterview("question-invalid");
  const admin = getInterviewAdminClient();
  const { data: sessionId, error } = await admin.rpc("resolve_interview_question", {
    p_question_id: questionId, p_created_by: authorization.userId, p_resolution: "not_relevant", p_suppress_topic: suppressTopic,
  });
  if (error || !isInterviewUuid(sessionId)) {
    console.error("Interview question not-relevant update failed", { questionId, ...errorSummary(error) });
    redirectToInterview("question-failed");
  }
  const next = await ensureNextInterviewQuestion(sessionId, authorization.userId);
  revalidatePath(INTERVIEW_PATH);
  redirectToInterview(next === "ready" ? (suppressTopic ? "topic-suppressed" : "not-relevant") : next);
}

/** Saves or clears the optional active-session focus used only for question prioritization. */
export async function setInterviewFocusAction(formData: FormData) {
  const authorization = await requireAdmin();
  const sessionId = formData.get("session_id");
  const focus = validateInterviewFocus(formData.get("focus_topic"));
  if (!isInterviewUuid(sessionId) || focus === null) redirectToInterview("focus-invalid");
  const topicKey = focus ? normalizeInterviewTopicKey(focus) : null;
  if (focus && !topicKey) redirectToInterview("focus-invalid");
  const admin = getInterviewAdminClient();
  const { data, error } = await admin.rpc("set_interview_session_focus", {
    p_session_id: sessionId,
    p_created_by: authorization.userId,
    p_focus_topic: focus || null,
    p_focus_topic_key: topicKey,
  });
  if (error || data !== true) {
    console.error("Interview focus update failed", { sessionId, ...errorSummary(error) });
    redirectToInterview("focus-failed");
  }
  revalidatePath(INTERVIEW_PATH);
  redirectToInterview(focus ? "focus-updated" : "focus-cleared");
}

/** Completes the active session, preserving any open question as a skipped historical question. */
export async function completeInterviewSessionAction(formData: FormData) {
  const authorization = await requireAdmin();
  const sessionId = formData.get("session_id");
  if (!isInterviewUuid(sessionId)) redirectToInterview("session-invalid");
  const admin = getInterviewAdminClient();
  const { data, error } = await admin.rpc("complete_interview_session", {
    p_session_id: sessionId,
    p_created_by: authorization.userId,
  });
  if (error || data !== true) {
    console.error("Interview session completion failed", { sessionId, ...errorSummary(error) });
    redirectToInterview("session-failed");
  }
  revalidatePath(INTERVIEW_PATH);
  redirectToInterview("session-completed");
}

/** Retries question generation after a recoverable model/context failure. */
export async function generateInterviewQuestionAction() {
  const authorization = await requireAdmin();
  const admin = getInterviewAdminClient();
  const { data: sessionId, error } = await admin.rpc("start_interview_session", { p_created_by: authorization.userId });
  if (error || !isInterviewUuid(sessionId)) {
    console.error("Interview question retry could not load session", errorSummary(error));
    redirectToInterview("start-failed");
  }
  const next = await ensureNextInterviewQuestion(sessionId, authorization.userId);
  revalidatePath(INTERVIEW_PATH);
  redirectToInterview(next === "ready" ? "question-ready" : next);
}

/** Retries failed/pending Answer -> Brain-draft extraction without modifying the raw answer. */
export async function retryInterviewAnswerExtractionAction(formData: FormData) {
  const authorization = await requireAdmin();
  const answerId = formData.get("answer_id");
  if (!isInterviewUuid(answerId)) redirectToInterview("extraction-invalid");
  const result = await extractInterviewAnswer(answerId, authorization.userId);
  revalidatePath(INTERVIEW_PATH);
  if (!result.ok) redirectToInterview("extraction-failed");
  redirectToInterview(result.state === "busy" ? "extraction-busy" : "extraction-complete", { count: result.createdCount });
}
