import "server-only";

import {
  isInterviewUuid,
  type InterviewGroundingSource,
  type InterviewQuestionContext,
} from "@/features/interview-eslam/core";
import type { InterviewGenerationIntelligence } from "@/features/interview-eslam/intelligence-server";
import {
  buildInterviewKnowledgeQueries,
  INTERVIEW_KNOWLEDGE_MAX_SOURCE_CHARS,
  INTERVIEW_KNOWLEDGE_MAX_SOURCES,
} from "@/features/interview-eslam/knowledge-guidance-core";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";
import { loadKnowledgeVectorStoreId } from "@/features/knowledge-library/model-context-data";
import {
  KNOWLEDGE_VECTOR_SEARCH_SCORE_THRESHOLD,
  knowledgeProviderErrorCode,
  searchKnowledgeVectorStore,
  type KnowledgeVectorSearchResult,
} from "@/features/knowledge-library/openai";

type KnowledgeSearchCandidate = {
  sourceId: string;
  fileId: string;
  score: number;
  text: string;
};

type KnowledgeSourceRow = {
  id: string;
  title: string;
  status: string;
  openai_file_id: string | null;
  vector_store_id: string | null;
};

/** Reads one provider search result as untrusted candidate metadata plus exact retrieved text. */
function parseKnowledgeSearchCandidate(result: KnowledgeVectorSearchResult): KnowledgeSearchCandidate | null {
  const fileId = typeof result.file_id === "string" ? result.file_id.trim() : "";
  const score = typeof result.score === "number" && Number.isFinite(result.score) ? result.score : -1;
  const attributes = result.attributes;
  if (!fileId || score < KNOWLEDGE_VECTOR_SEARCH_SCORE_THRESHOLD || !attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return null;
  }
  const sourceId = (attributes as { source_id?: unknown }).source_id;
  if (!isInterviewUuid(sourceId)) return null;
  if (!Array.isArray(result.content)) return null;

  const pieces = result.content.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as { type?: unknown; text?: unknown };
    if (candidate.type !== "text" || typeof candidate.text !== "string") return [];
    const text = candidate.text.trim();
    return text ? [text] : [];
  });
  const text = pieces.join("\n\n").trim().slice(0, INTERVIEW_KNOWLEDGE_MAX_SOURCE_CHARS);
  return text ? { sourceId, fileId, score, text } : null;
}

/** Validates provider candidates against durable ready Knowledge rows and emits only reconciled grounding sources. */
async function validateKnowledgeSearchCandidates(
  vectorStoreId: string,
  rawResults: KnowledgeVectorSearchResult[],
): Promise<InterviewGroundingSource[]> {
  const candidates = rawResults
    .map(parseKnowledgeSearchCandidate)
    .filter((candidate): candidate is KnowledgeSearchCandidate => candidate !== null);
  if (!candidates.length) return [];

  const sourceIds = [...new Set(candidates.map((candidate) => candidate.sourceId))];
  const admin = getKnowledgeAdminClient();
  const { data, error } = await admin
    .from("knowledge_sources")
    .select("id,title,status,openai_file_id,vector_store_id")
    .in("id", sourceIds)
    .eq("status", "ready");
  if (error) {
    console.error("Interview Knowledge source validation failed", {
      candidateCount: candidates.length,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  const rows = new Map(
    ((data ?? []) as KnowledgeSourceRow[]).map((row) => [row.id, row] as const),
  );
  const accepted = new Map<string, { row: KnowledgeSourceRow; text: string; score: number }>();
  for (const candidate of candidates) {
    const row = rows.get(candidate.sourceId);
    if (
      !row ||
      row.status !== "ready" ||
      row.openai_file_id !== candidate.fileId ||
      row.vector_store_id !== vectorStoreId ||
      !row.title.trim()
    ) {
      continue;
    }

    const existing = accepted.get(row.id);
    if (!existing) {
      accepted.set(row.id, { row, text: candidate.text, score: candidate.score });
      continue;
    }
    if (existing.text.includes(candidate.text)) continue;
    const remaining = INTERVIEW_KNOWLEDGE_MAX_SOURCE_CHARS - existing.text.length - 2;
    if (remaining <= 0) continue;
    existing.text = `${existing.text}\n\n${candidate.text.slice(0, remaining)}`;
    existing.score = Math.max(existing.score, candidate.score);
  }

  return [...accepted.values()]
    .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
    .slice(0, INTERVIEW_KNOWLEDGE_MAX_SOURCES)
    .map(({ row, text }) => ({
      id: `knowledge_library:${row.id}`,
      type: "knowledge_library" as const,
      label: `Knowledge · ${row.title.trim()}`,
      content: text,
    }));
}

/** Retrieves focus/coverage-aware Knowledge evidence and safely falls back to no Knowledge on provider failure. */
export async function loadInterviewKnowledgeGuidance(
  context: InterviewQuestionContext,
  intelligence: InterviewGenerationIntelligence,
) {
  const queries = buildInterviewKnowledgeQueries(context, intelligence);
  if (!queries.length) return [];

  try {
    const vectorStoreId = await loadKnowledgeVectorStoreId();
    if (!vectorStoreId) return [];
    const results = await searchKnowledgeVectorStore(vectorStoreId, queries);
    return await validateKnowledgeSearchCandidates(vectorStoreId, results);
  } catch (error) {
    console.error("Interview Knowledge guidance unavailable; continuing without it", {
      queryCount: queries.length,
      code: knowledgeProviderErrorCode(error),
      message: error instanceof Error ? error.message : "Unknown Knowledge guidance error",
    });
    return [];
  }
}
