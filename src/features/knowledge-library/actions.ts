"use server";

import { revalidatePath } from "next/cache";

import {
  KNOWLEDGE_LIBRARY_BUCKET,
  KNOWLEDGE_LIBRARY_MAX_BYTES,
  type KnowledgeFinalizeResult,
  type KnowledgeMutationResult,
  type KnowledgeSourceStatus,
  type KnowledgeUploadIntentResult,
  validateKnowledgeSourceId,
  validateKnowledgeUploadIntent,
} from "@/features/knowledge-library/core";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";
import {
  attachKnowledgeVectorStoreFile,
  createKnowledgeOpenAIFile,
  createKnowledgeVectorStore,
  deleteKnowledgeOpenAIFile,
  knowledgeProviderErrorCode,
  retrieveKnowledgeVectorStoreFile,
} from "@/features/knowledge-library/openai";
import { requireAdmin } from "@/lib/auth/admin";

const KNOWLEDGE_ADMIN_PATH = "/admin/knowledge";

type KnowledgeAdminClient = ReturnType<typeof getKnowledgeAdminClient>;

type StoredKnowledgeSource = {
  id: string;
  created_by: string;
  storage_bucket: string;
  storage_path: string;
  status: KnowledgeSourceStatus;
  title: string;
  original_filename: string;
  mime_type: string;
  declared_size_bytes: number;
  size_bytes: number | null;
  openai_file_id: string | null;
  vector_store_id: string | null;
};

function refreshKnowledgePage() {
  revalidatePath(KNOWLEDGE_ADMIN_PATH);
}

async function loadOwnedSource(
  admin: KnowledgeAdminClient,
  userId: string,
  sourceId: string,
): Promise<StoredKnowledgeSource | null> {
  const { data, error } = await admin
    .from("knowledge_sources")
    .select(
      "id,created_by,storage_bucket,storage_path,status,title,original_filename,mime_type,declared_size_bytes,size_bytes,openai_file_id,vector_store_id",
    )
    .eq("id", sourceId)
    .eq("created_by", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as StoredKnowledgeSource | null;
}

async function ensureKnowledgeVectorStore(admin: KnowledgeAdminClient) {
  const { data: current, error: currentError } = await admin
    .from("knowledge_library_config")
    .select("vector_store_id")
    .eq("library_key", "global")
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (current && typeof current.vector_store_id === "string" && current.vector_store_id) {
    return current.vector_store_id;
  }

  const createdId = await createKnowledgeVectorStore();
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("knowledge_library_config")
    .update({ vector_store_id: createdId, updated_at: now })
    .eq("library_key", "global")
    .is("vector_store_id", null)
    .select("vector_store_id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (claimed?.vector_store_id === createdId) return createdId;

  const { data: winner, error: winnerError } = await admin
    .from("knowledge_library_config")
    .select("vector_store_id")
    .eq("library_key", "global")
    .maybeSingle();
  if (winnerError || !winner?.vector_store_id) {
    throw new Error(winnerError?.message ?? "Knowledge vector store was not persisted");
  }
  return winner.vector_store_id as string;
}

async function markIndexFailure(
  admin: KnowledgeAdminClient,
  userId: string,
  sourceId: string,
  sizeBytes: number,
  errorCode: string,
  openaiFileId: string | null = null,
  vectorStoreId: string | null = null,
) {
  const { error } = await admin
    .from("knowledge_sources")
    .update({
      status: "failed",
      size_bytes: sizeBytes,
      openai_file_id: openaiFileId,
      vector_store_id: vectorStoreId,
      last_error_code: errorCode.slice(0, 100) || "provider-error",
      indexed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .eq("created_by", userId);
  if (error) {
    console.error("Knowledge Library failed-state persistence failed", {
      sourceId,
      code: error.code,
      message: error.message,
    });
  }
}

async function indexStoredSource(
  admin: KnowledgeAdminClient,
  userId: string,
  source: StoredKnowledgeSource,
  sizeBytes: number,
): Promise<"indexing" | "ready" | null> {
  let vectorStoreId: string | null = null;
  let openaiFileId: string | null = null;

  try {
    vectorStoreId = await ensureKnowledgeVectorStore(admin);
    const { data: sourceBlob, error: downloadError } = await admin.storage
      .from(source.storage_bucket)
      .download(source.storage_path);
    if (downloadError || !sourceBlob) {
      throw new Error(downloadError?.message ?? "Knowledge source could not be downloaded");
    }

    const file = new File([sourceBlob], source.original_filename, { type: source.mime_type });
    openaiFileId = await createKnowledgeOpenAIFile(file);
    const vectorFile = await attachKnowledgeVectorStoreFile(
      vectorStoreId,
      openaiFileId,
      source.id,
      source.title,
    );

    if (vectorFile.status === "failed" || vectorFile.status === "cancelled") {
      const errorCode = vectorFile.last_error?.code ?? vectorFile.status;
      await deleteKnowledgeOpenAIFile(openaiFileId).catch(() => undefined);
      await markIndexFailure(admin, userId, source.id, sizeBytes, errorCode, null, vectorStoreId);
      return null;
    }

    const ready = vectorFile.status === "completed";
    const { error: updateError } = await admin
      .from("knowledge_sources")
      .update({
        status: ready ? "ready" : "indexing",
        size_bytes: sizeBytes,
        openai_file_id: openaiFileId,
        vector_store_id: vectorStoreId,
        last_error_code: null,
        indexed_at: ready ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id)
      .eq("created_by", userId);

    if (updateError) {
      await deleteKnowledgeOpenAIFile(openaiFileId).catch(() => undefined);
      throw new Error(updateError.message);
    }

    refreshKnowledgePage();
    return ready ? "ready" : "indexing";
  } catch (error) {
    if (openaiFileId) {
      await deleteKnowledgeOpenAIFile(openaiFileId).catch(() => undefined);
      openaiFileId = null;
    }
    console.error("Knowledge Library indexing failed", {
      sourceId: source.id,
      message: error instanceof Error ? error.message : "Unknown indexing error",
    });
    await markIndexFailure(
      admin,
      userId,
      source.id,
      sizeBytes,
      knowledgeProviderErrorCode(error),
      openaiFileId,
      vectorStoreId,
    );
    refreshKnowledgePage();
    return null;
  }
}

/** Creates an owner-scoped Knowledge source and a signed private Storage upload token. */
export async function createKnowledgeUploadAction(input: unknown): Promise<KnowledgeUploadIntentResult> {
  const authorization = await requireAdmin();
  const validated = validateKnowledgeUploadIntent(input);
  if (!validated) return { ok: false, error: "invalid-document" };

  const admin = getKnowledgeAdminClient();
  const sourceId = crypto.randomUUID();
  const storagePath = `${authorization.userId}/${sourceId}.${validated.extension}`;
  const { error: insertError } = await admin.from("knowledge_sources").insert({
    id: sourceId,
    created_by: authorization.userId,
    storage_bucket: KNOWLEDGE_LIBRARY_BUCKET,
    storage_path: storagePath,
    status: "pending",
    title: validated.title,
    original_filename: validated.fileName,
    mime_type: validated.mimeType,
    declared_size_bytes: validated.sizeBytes,
  });
  if (insertError) {
    console.error("Knowledge Library upload intent failed", {
      stage: "metadata",
      code: insertError.code,
      message: insertError.message,
    });
    return { ok: false, error: "create-failed" };
  }

  const { data: signedUpload, error: signedError } = await admin.storage
    .from(KNOWLEDGE_LIBRARY_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (signedError || !signedUpload?.token) {
    await admin
      .from("knowledge_sources")
      .delete()
      .eq("id", sourceId)
      .eq("created_by", authorization.userId)
      .eq("status", "pending");
    return { ok: false, error: "create-failed" };
  }

  return {
    ok: true,
    intent: {
      sourceId,
      bucket: KNOWLEDGE_LIBRARY_BUCKET,
      storagePath,
      token: signedUpload.token,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      originalFilename: validated.fileName,
      title: validated.title,
    },
  };
}

/** Verifies the private object, then starts durable OpenAI File Search indexing. */
export async function finalizeKnowledgeUploadAction(input: unknown): Promise<KnowledgeFinalizeResult> {
  const authorization = await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };

  const admin = getKnowledgeAdminClient();
  let source: StoredKnowledgeSource | null;
  try {
    source = await loadOwnedSource(admin, authorization.userId, sourceId);
  } catch (error) {
    console.error("Knowledge Library finalization failed", {
      stage: "load",
      message: error instanceof Error ? error.message : "Unknown load error",
    });
    return { ok: false, error: "index-failed" };
  }
  if (!source) return { ok: false, error: "not-found" };
  if (source.status === "ready") return { ok: true, sourceId, status: "ready" };
  if (source.status === "indexing") return { ok: true, sourceId, status: "indexing" };
  if (source.status !== "pending") return { ok: false, error: "index-failed" };

  const { data: storedObject, error: infoError } = await admin.storage
    .from(source.storage_bucket)
    .info(source.storage_path);
  if (infoError || !storedObject) return { ok: false, error: "verify-failed" };

  const sizeBytes = Number(storedObject.size);
  const contentType = storedObject.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > KNOWLEDGE_LIBRARY_MAX_BYTES ||
    sizeBytes !== source.declared_size_bytes ||
    contentType !== source.mime_type
  ) {
    return { ok: false, error: "verify-failed" };
  }

  const status = await indexStoredSource(admin, authorization.userId, source, sizeBytes);
  return status
    ? { ok: true, sourceId, status }
    : { ok: false, error: "index-failed" };
}

/** Refreshes an in-progress source from the provider without changing ready sources. */
export async function refreshKnowledgeSourceAction(input: unknown): Promise<KnowledgeMutationResult> {
  const authorization = await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };
  const admin = getKnowledgeAdminClient();
  const source = await loadOwnedSource(admin, authorization.userId, sourceId).catch(() => null);
  if (!source) return { ok: false, error: "not-found" };
  if (source.status === "ready") return { ok: true, status: "ready" };
  if (source.status !== "indexing" || !source.openai_file_id || !source.vector_store_id || !source.size_bytes) {
    return { ok: false, error: "operation-failed" };
  }

  try {
    const providerState = await retrieveKnowledgeVectorStoreFile(
      source.vector_store_id,
      source.openai_file_id,
    );
    if (providerState.status === "in_progress") return { ok: true, status: "indexing" };
    if (providerState.status === "completed") {
      const { error } = await admin
        .from("knowledge_sources")
        .update({
          status: "ready",
          indexed_at: new Date().toISOString(),
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id)
        .eq("created_by", authorization.userId)
        .eq("status", "indexing");
      if (error) throw new Error(error.message);
      refreshKnowledgePage();
      return { ok: true, status: "ready" };
    }

    await markIndexFailure(
      admin,
      authorization.userId,
      source.id,
      source.size_bytes,
      providerState.last_error?.code ?? providerState.status,
      source.openai_file_id,
      source.vector_store_id,
    );
    refreshKnowledgePage();
    return { ok: true, status: "failed" };
  } catch (error) {
    console.error("Knowledge Library status refresh failed", {
      sourceId,
      message: error instanceof Error ? error.message : "Unknown refresh error",
    });
    return { ok: false, error: "operation-failed" };
  }
}

/** Rebuilds the provider index for a failed source from its preserved private file. */
export async function retryKnowledgeIndexAction(input: unknown): Promise<KnowledgeMutationResult> {
  const authorization = await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };
  const admin = getKnowledgeAdminClient();
  const source = await loadOwnedSource(admin, authorization.userId, sourceId).catch(() => null);
  if (!source) return { ok: false, error: "not-found" };
  if (source.status !== "failed" || !source.size_bytes) {
    return { ok: false, error: "operation-failed" };
  }

  try {
    if (source.openai_file_id) await deleteKnowledgeOpenAIFile(source.openai_file_id);
    const { error: clearError } = await admin
      .from("knowledge_sources")
      .update({
        openai_file_id: null,
        vector_store_id: null,
        last_error_code: "retry-pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id)
      .eq("created_by", authorization.userId)
      .eq("status", "failed");
    if (clearError) throw new Error(clearError.message);

    const retrySource = { ...source, openai_file_id: null, vector_store_id: null };
    const status = await indexStoredSource(
      admin,
      authorization.userId,
      retrySource,
      source.size_bytes,
    );
    return status ? { ok: true, status } : { ok: true, status: "failed" };
  } catch (error) {
    console.error("Knowledge Library retry failed", {
      sourceId,
      message: error instanceof Error ? error.message : "Unknown retry error",
    });
    return { ok: false, error: "operation-failed" };
  }
}

/** Claims a source for deletion and retries provider/Storage cleanup idempotently. */
export async function deleteKnowledgeSourceAction(input: unknown): Promise<KnowledgeMutationResult> {
  const authorization = await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };
  const admin = getKnowledgeAdminClient();

  const { error: claimError } = await admin
    .from("knowledge_sources")
    .update({ status: "deleting", updated_at: new Date().toISOString() })
    .eq("id", sourceId)
    .eq("created_by", authorization.userId)
    .neq("status", "deleting");
  if (claimError) return { ok: false, error: "operation-failed" };

  const source = await loadOwnedSource(admin, authorization.userId, sourceId).catch(() => null);
  if (!source) return { ok: true };
  if (source.status !== "deleting") return { ok: false, error: "operation-failed" };

  try {
    if (source.openai_file_id) await deleteKnowledgeOpenAIFile(source.openai_file_id);
    const { error: storageError } = await admin.storage
      .from(source.storage_bucket)
      .remove([source.storage_path]);
    if (storageError) throw new Error(storageError.message);

    const { error: deleteError } = await admin
      .from("knowledge_sources")
      .delete()
      .eq("id", source.id)
      .eq("created_by", authorization.userId)
      .eq("status", "deleting");
    if (deleteError) throw new Error(deleteError.message);
    refreshKnowledgePage();
    return { ok: true };
  } catch (error) {
    console.error("Knowledge Library delete cleanup failed", {
      sourceId,
      message: error instanceof Error ? error.message : "Unknown delete error",
    });
    refreshKnowledgePage();
    return { ok: false, error: "operation-failed" };
  }
}
