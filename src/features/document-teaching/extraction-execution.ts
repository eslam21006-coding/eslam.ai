import {
  buildDocumentTeachingResponseRequest,
  parseDocumentTeachingCandidates,
  type DocumentTeachingCandidate,
  type DocumentTeachingDraftSelection,
} from "./extraction-core.ts";

export const DOCUMENT_TEACHING_OPENAI_FILE_EXPIRY_SECONDS = 60 * 60;

type DocumentTeachingFileCreateInput = {
  file: File;
  purpose: "user_data";
  expires_after: {
    anchor: "created_at";
    seconds: number;
  };
};

export type DocumentTeachingExtractionClient = {
  createFile(input: DocumentTeachingFileCreateInput): Promise<{ id: string }>;
  createResponse(
    request: ReturnType<typeof buildDocumentTeachingResponseRequest>,
  ): Promise<{ status: string | null | undefined; outputText: string }>;
  deleteFile(fileId: string): Promise<void>;
};

type DocumentTeachingExtractionErrorCode =
  | "openai-extraction"
  | "openai-truncated"
  | "invalid-structured-output";

export type DocumentTeachingExtractionExecutionResult =
  | { ok: true; candidates: DocumentTeachingCandidate[] }
  | {
      ok: false;
      stage: "extraction";
      errorCode: DocumentTeachingExtractionErrorCode;
      error: unknown;
    }
  | { ok: false; stage: "finalize"; error: unknown | null };

type ExecuteDocumentTeachingExtractionInput = {
  createClient: () => DocumentTeachingExtractionClient;
  file: File;
  model: string;
  sourceTitle: string;
  completeCandidates: (candidates: DocumentTeachingCandidate[]) => Promise<boolean>;
  onCleanupError?: (error: unknown, fileId: string) => void;
};

/**
 * Executes the temporary OpenAI-file extraction lifecycle and finalizes candidates only after
 * cleanup has run. Client construction stays inside the guarded extraction boundary.
 */
export async function executeDocumentTeachingExtraction({
  createClient,
  file,
  model,
  sourceTitle,
  completeCandidates,
  onCleanupError,
}: ExecuteDocumentTeachingExtractionInput): Promise<DocumentTeachingExtractionExecutionResult> {
  let client: DocumentTeachingExtractionClient | null = null;
  let temporaryFileId: string | null = null;
  let candidates: DocumentTeachingCandidate[] = [];
  let extractionErrorCode: DocumentTeachingExtractionErrorCode = "openai-extraction";

  try {
    client = createClient();
    const uploadedFile = await client.createFile({
      file,
      purpose: "user_data",
      expires_after: {
        anchor: "created_at",
        seconds: DOCUMENT_TEACHING_OPENAI_FILE_EXPIRY_SECONDS,
      },
    });
    temporaryFileId = uploadedFile.id;

    const response = await client.createResponse(
      buildDocumentTeachingResponseRequest(model, uploadedFile.id, sourceTitle),
    );
    if (response.status === "incomplete") {
      extractionErrorCode = "openai-truncated";
      throw new Error("Document teaching response was incomplete before structured output completed");
    }

    const parsed = parseDocumentTeachingCandidates(response.outputText);
    if (!parsed.ok) {
      extractionErrorCode = "invalid-structured-output";
      throw new Error("Structured document extraction failed independent validation");
    }
    candidates = parsed.candidates;
  } catch (error) {
    return {
      ok: false,
      stage: "extraction",
      errorCode: extractionErrorCode,
      error,
    };
  } finally {
    if (temporaryFileId && client) {
      try {
        await client.deleteFile(temporaryFileId);
      } catch (error) {
        onCleanupError?.(error, temporaryFileId);
      }
    }
  }

  try {
    const completed = await completeCandidates(candidates);
    if (!completed) return { ok: false, stage: "finalize", error: null };
  } catch (error) {
    return { ok: false, stage: "finalize", error };
  }

  return { ok: true, candidates };
}

export type DocumentTeachingDraftRpcPayload = {
  p_extraction_id: string;
  p_created_by: string;
  p_candidates: DocumentTeachingDraftSelection[];
};

type ExecuteDocumentTeachingDraftCreationInput = {
  extractionId: string;
  userId: string;
  candidates: DocumentTeachingDraftSelection[];
};

/** Executes the reviewed-candidate draft RPC through an injected persistence boundary. */
export async function executeDocumentTeachingDraftCreation<T>(
  { extractionId, userId, candidates }: ExecuteDocumentTeachingDraftCreationInput,
  createDrafts: (payload: DocumentTeachingDraftRpcPayload) => Promise<T>,
): Promise<T> {
  return createDrafts({
    p_extraction_id: extractionId,
    p_created_by: userId,
    p_candidates: candidates.map((candidate) => ({ ...candidate })),
  });
}
