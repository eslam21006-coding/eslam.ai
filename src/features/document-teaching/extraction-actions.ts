"use server";

import { revalidatePath } from "next/cache";

import {
  DOCUMENT_TEACHING_LEASE_SECONDS,
  DOCUMENT_TEACHING_PROMPT_VERSION,
  buildDocumentTeachingResponseRequest,
  isDocumentTeachingUuid,
  parseDocumentTeachingCandidates,
  validateDocumentTeachingDraftSelections,
  validateDocumentTeachingExtractionInput,
  type DocumentTeachingDraftsActionResult,
  type DocumentTeachingExtractionActionResult,
} from "@/features/document-teaching/extraction-core";
import { getDocumentTeachingAdminClient } from "@/features/document-teaching/database";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getOpenAIDocumentTeachingClient,
  getOpenAIDocumentTeachingModel,
} from "@/lib/openai/client";
import type { Json } from "@/types/database";

const DOCUMENT_PAGE = "/admin/teach/documents";
const BRAIN_PAGE = "/admin/brain";
const TEACH_PAGE = "/admin/teach";
const OPENAI_FILE_EXPIRY_SECONDS = 60 * 60;

type ClaimRow = {
  extraction_id: string | null;
  claim_state: string;
  attempt_count: number;
  claim_token: string | null;
};

async function failClaimedExtraction(
  extractionId: string,
  userId: string,
  claimToken: string,
  errorCode: string,
) {
  const admin = getDocumentTeachingAdminClient();
  const { data, error } = await admin.rpc("fail_document_teaching_extraction", {
    p_extraction_id: extractionId,
    p_created_by: userId,
    p_claim_token: claimToken,
    p_error_code: errorCode,
  });

  if (error || data !== true) {
    console.error("Document teaching extraction failure state could not be persisted", {
      extractionId,
      errorCode,
      code: error?.code,
      message: error?.message ?? "Attempt was no longer owned by this worker",
    });
  }
}

/** Extracts immutable review candidates from one finalized, owner-scoped document source. */
export async function extractDocumentTeachingAction(
  input: unknown,
): Promise<DocumentTeachingExtractionActionResult> {
  const authorization = await requireAdmin();
  const validated = validateDocumentTeachingExtractionInput(input);
  if (!validated) return { ok: false, error: "invalid-request" };

  const admin = getDocumentTeachingAdminClient();
  const model = getOpenAIDocumentTeachingModel();
  const { data: claimRows, error: claimError } = await admin.rpc(
    "claim_document_teaching_extraction",
    {
      p_document_id: validated.documentId,
      p_created_by: authorization.userId,
      p_model: model,
      p_prompt_version: DOCUMENT_TEACHING_PROMPT_VERSION,
      p_lease_seconds: DOCUMENT_TEACHING_LEASE_SECONDS,
    },
  );

  if (claimError) {
    console.error("Document teaching extraction claim failed", {
      documentId: validated.documentId,
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
    return { ok: true, state: "processing", extractionId: claim.extraction_id ?? null };
  }
  if (claim.claim_state !== "claimed" || !claim.extraction_id || !claim.claim_token) {
    console.error("Document teaching extraction returned an invalid claim state", {
      documentId: validated.documentId,
      state: claim.claim_state,
    });
    return { ok: false, error: "extraction-failed" };
  }

  const extractionId = claim.extraction_id;
  const claimToken = claim.claim_token;
  const { data: document, error: documentError } = await admin
    .from("document_teaching_uploads")
    .select(
      "id,status,storage_bucket,storage_path,original_filename,mime_type,source_title,source_id",
    )
    .eq("id", validated.documentId)
    .eq("created_by", authorization.userId)
    .eq("status", "uploaded")
    .maybeSingle();

  if (documentError || !document?.source_id) {
    console.error("Document teaching source could not be loaded", {
      documentId: validated.documentId,
      code: documentError?.code,
      message: documentError?.message ?? "Finalized document source missing",
    });
    await failClaimedExtraction(extractionId, authorization.userId, claimToken, "source-not-found");
    revalidatePath(DOCUMENT_PAGE);
    return { ok: false, error: "not-found" };
  }

  const { data: blob, error: downloadError } = await admin.storage
    .from(document.storage_bucket)
    .download(document.storage_path);

  if (downloadError || !blob) {
    console.error("Document teaching private source download failed", {
      documentId: document.id,
      message: downloadError?.message ?? "Storage returned no document bytes",
    });
    await failClaimedExtraction(extractionId, authorization.userId, claimToken, "storage-download");
    revalidatePath(DOCUMENT_PAGE);
    return { ok: false, error: "download-failed" };
  }

  let openai: ReturnType<typeof getOpenAIDocumentTeachingClient> | null = null;
  let temporaryFileId: string | null = null;
  let candidates;
  let extractionErrorCode = "openai-extraction";

  try {
    openai = getOpenAIDocumentTeachingClient();
    const file = new File([blob], document.original_filename, { type: document.mime_type });
    const uploadedFile = await openai.files.create({
      file,
      purpose: "user_data",
      expires_after: {
        anchor: "created_at",
        seconds: OPENAI_FILE_EXPIRY_SECONDS,
      },
    });
    temporaryFileId = uploadedFile.id;

    const response = await openai.responses.create(
      buildDocumentTeachingResponseRequest(model, uploadedFile.id, document.source_title),
    );
    if (response.status === "incomplete") {
      extractionErrorCode = "openai-truncated";
      throw new Error("Document teaching response was incomplete before structured output completed");
    }

    const parsed = parseDocumentTeachingCandidates(response.output_text);
    if (!parsed.ok) {
      extractionErrorCode = "invalid-structured-output";
      throw new Error("Structured document extraction failed independent validation");
    }
    candidates = parsed.candidates;
  } catch (error) {
    console.error("OpenAI document teaching extraction failed", {
      documentId: validated.documentId,
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
    revalidatePath(DOCUMENT_PAGE);
    return { ok: false, error: "extraction-failed" };
  } finally {
    if (temporaryFileId && openai) {
      try {
        await openai.files.delete(temporaryFileId);
      } catch (error) {
        console.warn("Temporary OpenAI document file cleanup failed; expiry remains active", {
          fileId: temporaryFileId,
          message: error instanceof Error ? error.message : "Unknown file deletion error",
        });
      }
    }
  }

  const { data: completed, error: completeError } = await admin.rpc(
    "complete_document_teaching_extraction",
    {
      p_extraction_id: extractionId,
      p_created_by: authorization.userId,
      p_claim_token: claimToken,
      p_candidates: candidates as unknown as Json,
    },
  );

  if (completeError || completed !== true) {
    console.error("Document teaching extraction completion lost its claim", {
      documentId: validated.documentId,
      extractionId,
      code: completeError?.code,
      message: completeError?.message ?? "Claim token no longer owns this extraction",
    });
    revalidatePath(DOCUMENT_PAGE);
    return { ok: false, error: "finalize-conflict" };
  }

  revalidatePath(DOCUMENT_PAGE);
  return { ok: true, state: "completed", extractionId };
}

/** Creates Brain drafts from explicitly selected, admin-reviewed document candidates only. */
export async function createDocumentTeachingDraftsAction(
  input: unknown,
): Promise<DocumentTeachingDraftsActionResult> {
  const authorization = await requireAdmin();
  const validated = validateDocumentTeachingDraftSelections(input);
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

  const admin = getDocumentTeachingAdminClient();
  const { data, error } = await admin.rpc("create_document_teaching_drafts", {
    p_extraction_id: validated.extractionId,
    p_created_by: authorization.userId,
    p_candidates: payload as unknown as Json,
  });

  if (error || !Array.isArray(data)) {
    console.error("Document teaching draft materialization failed", {
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
      !isDocumentTeachingUuid(candidateId) ||
      !isDocumentTeachingUuid(brainItemId) ||
      versionNumber !== 1
    ) {
      return { ok: false, error: "save-failed" };
    }
    created.push({ candidateId, brainItemId, versionNumber: 1 as const });
  }

  if (created.length !== validated.candidates.length) {
    return { ok: false, error: "save-failed" };
  }

  revalidatePath(DOCUMENT_PAGE);
  revalidatePath(BRAIN_PAGE);
  revalidatePath(TEACH_PAGE);
  return { ok: true, created };
}
