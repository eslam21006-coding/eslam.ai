import "server-only";

import { buildInterviewQuestionRequest, type InterviewQuestionContext } from "@/features/interview-eslam/core";
import {
  buildInterviewIntelligenceDirective,
  findSemanticDuplicateIndex,
  INTERVIEW_SEMANTIC_HISTORY_LIMIT,
  type InterviewCoverage,
} from "@/features/interview-eslam/intelligence-core";
import { getOpenAIClient, getOpenAIEmbeddingModel } from "@/lib/openai/client";

export type InterviewGenerationIntelligence = {
  focusTopic: string | null;
  coverage: InterviewCoverage;
};

/** Adds trusted focus/coverage priorities and explicit Knowledge provenance to the grounded-question request contract. */
export function buildIntelligentInterviewQuestionRequest(
  model: string,
  context: InterviewQuestionContext,
  intelligence: InterviewGenerationIntelligence,
  rejectionReason?: string,
) {
  const base = buildInterviewQuestionRequest(model, context, rejectionReason);
  const knowledgeGroundingDirective = context.sources.some((source) => source.type === "knowledge_library")
    ? "If knowledge_library material materially shapes the question, that exact knowledge_library source must itself appear in groundings with a copied contiguous excerpt. Never use external Knowledge implicitly without grounding it."
    : "";
  return {
    ...base,
    instructions: [
      base.instructions,
      buildInterviewIntelligenceDirective(intelligence.focusTopic, intelligence.coverage),
      knowledgeGroundingDirective,
    ].filter(Boolean).join(" "),
  };
}

/** Logs semantic-check degradation without recording question text or other source content. */
function logSemanticDuplicateDegradation(reason: string, historyCount: number, error?: unknown) {
  console.error("Interview semantic duplicate check degraded to deterministic lexical protection", {
    reason,
    historyCount,
    message: error instanceof Error ? error.message : undefined,
  });
}

/** Compares a validated candidate with recent history, degrading to existing lexical guards if embeddings are unavailable. */
export async function findSemanticInterviewDuplicate(candidate: string, context: InterviewQuestionContext) {
  const history = context.previousQuestions.slice(-INTERVIEW_SEMANTIC_HISTORY_LIMIT);
  if (!history.length) return null;

  const inputs = [candidate, ...history.map((item) => item.question)];
  let response;
  try {
    response = await getOpenAIClient().embeddings.create({
      model: getOpenAIEmbeddingModel(),
      input: inputs,
      encoding_format: "float",
    });
  } catch (error) {
    logSemanticDuplicateDegradation("embedding-request-failed", history.length, error);
    return null;
  }

  const vectors = new Map<number, number[]>();
  for (const row of response.data) {
    if (Number.isInteger(row.index) && Array.isArray(row.embedding) && row.embedding.length) {
      vectors.set(row.index, row.embedding);
    }
  }
  const candidateVector = vectors.get(0);
  if (!candidateVector) {
    logSemanticDuplicateDegradation("missing-candidate-embedding", history.length);
    return null;
  }
  const previousVectors: number[][] = [];
  for (let index = 1; index < inputs.length; index += 1) {
    const vector = vectors.get(index);
    if (!vector) {
      logSemanticDuplicateDegradation("incomplete-history-embeddings", history.length);
      return null;
    }
    previousVectors.push(vector);
  }
  const duplicate = findSemanticDuplicateIndex(candidateVector, previousVectors);
  if (!duplicate) return null;
  return {
    priorQuestionId: history[duplicate.index]?.id ?? null,
    score: duplicate.score,
  };
}
