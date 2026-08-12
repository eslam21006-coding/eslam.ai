"use server";

import { revalidatePath } from "next/cache";

import {
  VOICE_TEACHING_LEASE_SECONDS,
  VOICE_TEACHING_PROMPT_VERSION,
  buildVoiceTeachingResponseRequest,
  isVoiceTeachingUuid,
  parseVoiceTeachingCandidates,
  validateVoiceTeachingDraftSelections,
  validateVoiceTeachingExtractionInput,
  type VoiceTeachingDraftsActionResult,
  type VoiceTeachingExtractionActionResult,
} from "@/features/voice-teaching/core";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getOpenAIVoiceTeachingClient,
  getOpenAIVoiceTeachingModel,
} from "@/lib/openai/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const VOICE_PAGE = "/admin/teach/voice";
const BRAIN_PAGE = "/admin/brain";
const TEACH_PAGE = "/admin/teach";

type ClaimRow = {
  extraction_id: string | null;
  claim_state: string;
  attempt_count: number;
  claim_token: string | null;
};

/** Persists a retryable failure only when this worker still owns the extraction claim. */
async function failClaimedExtraction(
  extractionId: string,
  userId: string,
  claimToken: string,
  errorCode: string,
) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("fail_voice_teaching_extraction", {
    p_extraction_id: extractionId,
    p_created_by: userId,
    p_claim_token: claimToken,
    p_error_code: errorCode,
  });

  if (error || data !== true) {
    console.error("Voice teaching extraction failure state could not be persisted", {
      extractionId,
      errorCode,
      code: error?.code,
      message: error?.message ?? "Attempt was no longer owned by this worker",
    });
  }
}

/** Extracts immutable review candidates from one completed owner-scoped voice transcript. */
export async function extractVoiceTeachingAction(
  input: unknown,
): Promise<VoiceTeachingExtractionActionResult> {
  const authorization = await requireAdmin();
  const validated = validateVoiceTeachingExtractionInput(input);
  if (!validated) return { ok: false, error: "invalid-request" };

  const admin = getSupabaseAdminClient();
  const model = getOpenAIVoiceTeachingModel();
  const { data: claimRows, error: claimError } = await admin.rpc(
    "claim_voice_teaching_extraction",
    {
      p_transcription_id: validated.transcriptionId,
      p_created_by: authorization.userId,
      p_model: model,
      p_prompt_version: VOICE_TEACHING_PROMPT_VERSION,
      p_lease_seconds: VOICE_TEACHING_LEASE_SECONDS,
    },
  );

  if (claimError) {
    console.error("Voice teaching extraction claim failed", {
      transcriptionId: validated.transcriptionId,
      code: claimError.code,
      message: claimError.message,
    });
    return { ok: false, error: "extraction-failed" };
  }

  const claim = (claimRows?.[0] ?? null) as ClaimRow | null;
  if (!claim || claim.claim_state === "not_found") return { ok: false, error: "not-found" };
  if (claim.claim_state === "completed" && claim.extraction_id) {
    return { ok: true, state: "completed", extractionId: claim.extraction_id };
  }
  if (claim.claim_state === "busy") {
    return {
      ok: true,
      state: "processing",
      extractionId: claim.extraction_id ?? null,
    };
  }
  if (claim.claim_state !== "claimed" || !claim.extraction_id || !claim.claim_token) {
    console.error("Voice teaching extraction returned an invalid claim state", {
      transcriptionId: validated.transcriptionId,
      state: claim.claim_state,
    });
    return { ok: false, error: "extraction-failed" };
  }

  const extractionId = claim.extraction_id;
  const claimToken = claim.claim_token;
  const { data: transcription, error: transcriptionError } = await admin
    .from("voice_transcriptions")
    .select("id,status,transcript_text,voice_recording_id")
    .eq("id", validated.transcriptionId)
    .eq("created_by", authorization.userId)
    .eq("status", "completed")
    .maybeSingle();

  if (transcriptionError || !transcription?.transcript_text) {
    console.error("Voice teaching source transcript could not be loaded", {
      transcriptionId: validated.transcriptionId,
      code: transcriptionError?.code,
      message: transcriptionError?.message ?? "Completed transcript missing",
    });
    await failClaimedExtraction(extractionId, authorization.userId, claimToken, "source-not-found");
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "not-found" };
  }

  let candidates;
  let extractionErrorCode = "openai-extraction";
  try {
    const response = await getOpenAIVoiceTeachingClient().responses.create(
      buildVoiceTeachingResponseRequest(model, transcription.transcript_text),
    );

    if (response.status === "incomplete") {
      extractionErrorCode = "openai-truncated";
      throw new Error("Voice teaching response was incomplete before structured output completed");
    }

    const parsed = parseVoiceTeachingCandidates(response.output_text, transcription.transcript_text);
    if (!parsed.ok) throw new Error("Structured extraction failed independent validation");
    candidates = parsed.candidates;
  } catch (error) {
    console.error("OpenAI voice teaching extraction failed", {
      transcriptionId: validated.transcriptionId,
      extractionId,
      model,
      errorCode: extractionErrorCode,
      message: error instanceof Error ? error.message : "Unknown extraction error",
    });
    await failClaimedExtraction(
      extractionId,
      authorization.userId,
      claimToken,
      extractionErrorCode,
    );
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "extraction-failed" };
  }

  const { data: completed, error: completeError } = await admin.rpc(
    "complete_voice_teaching_extraction",
    {
      p_extraction_id: extractionId,
      p_created_by: authorization.userId,
      p_claim_token: claimToken,
      p_candidates: candidates as unknown as Json,
    },
  );

  if (completeError || completed !== true) {
    console.error("Voice teaching extraction completion lost its claim", {
      transcriptionId: validated.transcriptionId,
      extractionId,
      code: completeError?.code,
      message: completeError?.message ?? "Claim token no longer owns this extraction",
    });
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "finalize-conflict" };
  }

  revalidatePath(VOICE_PAGE);
  return { ok: true, state: "completed", extractionId };
}

/** Materializes selected, reviewed candidates into Brain drafts only; approval and publication remain separate review actions. */
export async function createVoiceTeachingDraftsAction(
  input: unknown,
): Promise<VoiceTeachingDraftsActionResult> {
  const authorization = await requireAdmin();
  const validated = validateVoiceTeachingDraftSelections(input);
  if (!validated.ok) return { ok: false, error: "invalid-request" };

  const payload = validated.candidates.map((candidate) => ({
    candidate_id: candidate.candidate_id,
    semantic_layer: candidate.semantic_layer,
    item_type: candidate.item_type,
    priority: candidate.priority,
    title: candidate.title,
    content: candidate.content,
    summary: candidate.summary,
    topics: candidate.topics,
    change_note: candidate.change_note,
  }));

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_voice_teaching_drafts", {
    p_extraction_id: validated.extractionId,
    p_created_by: authorization.userId,
    p_candidates: payload as unknown as Json,
  });

  if (error || !Array.isArray(data)) {
    console.error("Voice teaching draft materialization failed", {
      extractionId: validated.extractionId,
      code: error?.code,
      message: error?.message ?? "RPC returned an invalid result",
    });
    return { ok: false, error: "save-failed" };
  }

  const created = [];
  for (const row of data) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: "save-failed" };
    }
    const candidateId = "candidate_id" in row ? row.candidate_id : null;
    const brainItemId = "brain_item_id" in row ? row.brain_item_id : null;
    const versionNumber = "version_number" in row ? row.version_number : null;
    if (
      !isVoiceTeachingUuid(candidateId) ||
      !isVoiceTeachingUuid(brainItemId) ||
      versionNumber !== 1
    ) {
      return { ok: false, error: "save-failed" };
    }
    created.push({ candidateId, brainItemId, versionNumber: 1 as const });
  }

  if (created.length !== validated.candidates.length) {
    return { ok: false, error: "save-failed" };
  }

  revalidatePath(VOICE_PAGE);
  revalidatePath(BRAIN_PAGE);
  revalidatePath(TEACH_PAGE);
  return { ok: true, created };
}
