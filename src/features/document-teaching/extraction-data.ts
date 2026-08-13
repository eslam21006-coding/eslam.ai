import "server-only";

import { DOCUMENT_TEACHING_PAGE_SIZE } from "@/features/document-teaching/data";
import { getDocumentTeachingAdminClient } from "@/features/document-teaching/database";

export type DocumentTeachingCandidateView = {
  id: string;
  extractionId: string;
  ordinal: number;
  semanticLayer: string;
  itemType: string;
  priority: number;
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
  sourceExcerpt: string;
  sourceLocator: string;
  brainItemId: string | null;
};

export type DocumentTeachingExtractionView = {
  documentId: string;
  extractionId: string | null;
  status: string | null;
  model: string | null;
  attemptCount: number | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
  completedAt: string | null;
  canExtract: boolean;
  candidates: DocumentTeachingCandidateView[];
};

/** Returns the canonical no-extraction state for one uploaded document. */
export function emptyDocumentTeachingExtractionView(
  documentId: string,
): DocumentTeachingExtractionView {
  return {
    documentId,
    extractionId: null,
    status: null,
    model: null,
    attemptCount: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    completedAt: null,
    canExtract: true,
    candidates: [],
  };
}

function leaseIsActive(value: string | null, nowMs: number) {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

/** Loads extraction, candidate, and draft-mapping state only for the visible document page. */
export async function loadDocumentTeachingExtractionState(userId: string, documentIds: string[]) {
  const uniqueIds = Array.from(new Set(documentIds));
  if (uniqueIds.length > DOCUMENT_TEACHING_PAGE_SIZE) {
    throw new Error("Document teaching extraction state must be loaded one document page at a time.");
  }
  if (uniqueIds.length === 0) return new Map<string, DocumentTeachingExtractionView>();

  const admin = getDocumentTeachingAdminClient();
  const { data: extractions, error: extractionError } = await admin
    .from("document_teaching_extractions")
    .select("id,document_upload_id,status,model,attempt_count,lease_expires_at,last_error_code,completed_at")
    .eq("created_by", userId)
    .in("document_upload_id", uniqueIds)
    .limit(DOCUMENT_TEACHING_PAGE_SIZE);

  if (extractionError) {
    throw new Error(`Unable to load document teaching extractions: ${extractionError.code}`);
  }

  const extractionIds = (extractions ?? []).map((extraction) => extraction.id);
  const candidatesByExtraction = new Map<string, DocumentTeachingCandidateView[]>();
  const candidateLimit = DOCUMENT_TEACHING_PAGE_SIZE * 12;

  if (extractionIds.length > 0) {
    const { data: candidates, error: candidatesError } = await admin
      .from("document_teaching_candidates")
      .select(
        "id,extraction_id,ordinal,semantic_layer,item_type,priority,title,content,summary,topics,source_excerpt,source_locator",
      )
      .eq("created_by", userId)
      .in("extraction_id", extractionIds)
      .order("ordinal", { ascending: true })
      .limit(candidateLimit);

    if (candidatesError) {
      throw new Error(`Unable to load document teaching candidates: ${candidatesError.code}`);
    }

    const candidateIds = (candidates ?? []).map((candidate) => candidate.id);
    const materializedByCandidate = new Map<string, string>();
    if (candidateIds.length > 0) {
      const { data: mappings, error: mappingError } = await admin
        .from("document_teaching_candidate_drafts")
        .select("candidate_id,brain_item_id")
        .eq("created_by", userId)
        .in("candidate_id", candidateIds)
        .limit(candidateLimit);

      if (mappingError) {
        throw new Error(`Unable to load document teaching draft mappings: ${mappingError.code}`);
      }

      for (const mapping of mappings ?? []) {
        materializedByCandidate.set(mapping.candidate_id, mapping.brain_item_id);
      }
    }

    for (const candidate of candidates ?? []) {
      const existing = candidatesByExtraction.get(candidate.extraction_id) ?? [];
      existing.push({
        id: candidate.id,
        extractionId: candidate.extraction_id,
        ordinal: candidate.ordinal,
        semanticLayer: candidate.semantic_layer,
        itemType: candidate.item_type,
        priority: candidate.priority,
        title: candidate.title,
        content: candidate.content,
        summary: candidate.summary,
        topics: candidate.topics,
        sourceExcerpt: candidate.source_excerpt,
        sourceLocator: candidate.source_locator,
        brainItemId: materializedByCandidate.get(candidate.id) ?? null,
      });
      candidatesByExtraction.set(candidate.extraction_id, existing);
    }
  }

  const nowMs = Date.now();
  const byDocument = new Map<string, DocumentTeachingExtractionView>();
  for (const documentId of uniqueIds) {
    const extraction = (extractions ?? []).find((item) => item.document_upload_id === documentId);
    if (!extraction) {
      byDocument.set(documentId, emptyDocumentTeachingExtractionView(documentId));
      continue;
    }

    byDocument.set(documentId, {
      documentId,
      extractionId: extraction.id,
      status: extraction.status,
      model: extraction.model,
      attemptCount: extraction.attempt_count,
      leaseExpiresAt: extraction.lease_expires_at,
      lastErrorCode: extraction.last_error_code,
      completedAt: extraction.completed_at,
      canExtract:
        extraction.status === "failed" ||
        (extraction.status === "processing" && !leaseIsActive(extraction.lease_expires_at, nowMs)),
      candidates: candidatesByExtraction.get(extraction.id) ?? [],
    });
  }

  return byDocument;
}
