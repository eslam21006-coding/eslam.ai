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

/** Adds trusted focus/coverage priorities to the existing grounded-question request contract. */
export function buildIntelligentInterviewQuestionRequest(
  model: string,
  context: InterviewQuestionContext,
  intelligence: InterviewGenerationIntelligence,
  rejectionReason?: string,
) {
  const base = buildInterviewQuestionRequest(model, context, rejectionReason);
  return {
    ...base,
    instructions: `${base.instructions} ${buildInterviewIntelligenceDirective(intelligence.focusTopic, intelligence.coverage)}`,
  };
}

/** Compares a validated candidate question with recent question history using one bounded embedding request. */
export async function findSemanticInterviewDuplicate(candidate: string, context: InterviewQuestionContext) {
  const history = context.previousQuestions.slice(-INTERVIEW_SEMANTIC_HISTORY_LIMIT);
  if (!history.length) return null;

  const inputs = [candidate, ...history.map((item) => item.question)];
  const response = await getOpenAIClient().embeddings.create({
    model: getOpenAIEmbeddingModel(),
    input: inputs,
    encoding_format: "float",
  });
  const vectors = new Map<number, number[]>();
  for (const row of response.data) {
    if (Number.isInteger(row.index) && Array.isArray(row.embedding) && row.embedding.length) {
      vectors.set(row.index, row.embedding);
    }
  }
  const candidateVector = vectors.get(0);
  if (!candidateVector) throw new Error("Interview semantic duplicate check returned no candidate embedding.");
  const previousVectors: number[][] = [];
  for (let index = 1; index < inputs.length; index += 1) {
    const vector = vectors.get(index);
    if (!vector) throw new Error("Interview semantic duplicate check returned incomplete embeddings.");
    previousVectors.push(vector);
  }
  const duplicate = findSemanticDuplicateIndex(candidateVector, previousVectors);
  if (!duplicate) return null;
  return {
    priorQuestionId: history[duplicate.index]?.id ?? null,
    score: duplicate.score,
  };
}
