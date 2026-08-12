import "server-only";

import { isVoiceTranscriptionLeaseActive } from "@/features/voice-transcription/core";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type VoiceTeachingCandidateView = {
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
  brainItemId: string | null;
};

export type VoiceTeachingExtractionView = {
  transcriptionId: string;
  extractionId: string | null;
  status: string | null;
  model: string | null;
  attemptCount: number | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
  completedAt: string | null;
  canExtract: boolean;
  candidates: VoiceTeachingCandidateView[];
};

/** Loads bounded owner-scoped extraction/candidate state for the visible completed transcripts. */
export async function loadVoiceTeachingState(userId: string, transcriptionIds: string[]) {
  const uniqueIds = Array.from(new Set(transcriptionIds)).slice(0, 20);
  if (uniqueIds.length === 0) return new Map<string, VoiceTeachingExtractionView>();

  const admin = getSupabaseAdminClient();
  const { data: extractions, error: extractionError } = await admin
    .from("voice_teaching_extractions")
    .select(
      "id,voice_transcription_id,status,model,attempt_count,lease_expires_at,last_error_code,completed_at",
    )
    .eq("created_by", userId)
    .in("voice_transcription_id", uniqueIds)
    .limit(20);

  if (extractionError) {
    throw new Error(`Unable to load voice teaching extractions: ${extractionError.code}`);
  }

  const extractionIds = (extractions ?? []).map((extraction) => extraction.id);
  const candidatesByExtraction = new Map<string, VoiceTeachingCandidateView[]>();

  if (extractionIds.length > 0) {
    const { data: candidates, error: candidatesError } = await admin
      .from("voice_teaching_candidates")
      .select(
        "id,extraction_id,ordinal,semantic_layer,item_type,priority,title,content,summary,topics,source_excerpt",
      )
      .eq("created_by", userId)
      .in("extraction_id", extractionIds)
      .order("ordinal", { ascending: true })
      .limit(240);

    if (candidatesError) {
      throw new Error(`Unable to load voice teaching candidates: ${candidatesError.code}`);
    }

    const candidateIds = (candidates ?? []).map((candidate) => candidate.id);
    const materializedByCandidate = new Map<string, string>();
    if (candidateIds.length > 0) {
      const { data: mappings, error: mappingError } = await admin
        .from("voice_teaching_candidate_drafts")
        .select("candidate_id,brain_item_id")
        .eq("created_by", userId)
        .in("candidate_id", candidateIds)
        .limit(240);

      if (mappingError) {
        throw new Error(`Unable to load voice teaching draft mappings: ${mappingError.code}`);
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
        brainItemId: materializedByCandidate.get(candidate.id) ?? null,
      });
      candidatesByExtraction.set(candidate.extraction_id, existing);
    }
  }

  const nowMs = Date.now();
  const byTranscription = new Map<string, VoiceTeachingExtractionView>();
  for (const transcriptionId of uniqueIds) {
    const extraction = (extractions ?? []).find(
      (item) => item.voice_transcription_id === transcriptionId,
    );
    const canExtract =
      !extraction ||
      extraction.status === "failed" ||
      (extraction.status === "processing" &&
        !isVoiceTranscriptionLeaseActive(extraction.lease_expires_at, nowMs));

    byTranscription.set(transcriptionId, {
      transcriptionId,
      extractionId: extraction?.id ?? null,
      status: extraction?.status ?? null,
      model: extraction?.model ?? null,
      attemptCount: extraction?.attempt_count ?? null,
      leaseExpiresAt: extraction?.lease_expires_at ?? null,
      lastErrorCode: extraction?.last_error_code ?? null,
      completedAt: extraction?.completed_at ?? null,
      canExtract,
      candidates: extraction ? candidatesByExtraction.get(extraction.id) ?? [] : [],
    });
  }

  return byTranscription;
}
