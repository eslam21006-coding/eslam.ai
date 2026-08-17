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
  deleteKnowledgeVectorStore,
  knowledgeProviderErrorCode,
  retrieveKnowledgeVectorStoreFile,
} from "@/features/knowledge-library/openai";
import { requireAdmin } from "@/lib/auth/admin";

const KNOWLEDGE_ADMIN_PATH = "/admin/knowledge";
const KNOWLEDGE_INDEX_LEASE_SECONDS = 180;
const KNOWLEDGE_STORAGE_DOWNLOAD_TIMEOUT_MS = 120_000;

type KnowledgeAdminClient = ReturnType<typeof getKnowledgeAdminClient>;

type StoredKnowledgeSource = {
  id: string;
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
  index_claim_token: string | null;
  index_lease_expires_at: string | null;
};

type KnowledgeIndexClaim = {
  state: "claimed" | "busy" | "provider_indexing" | "ready" | "deleting" | "not_found" | "not_claimable";
  token: string | null;
  previousOpenAIFileId: string | null;
  previousVectorStoreId: string | null;
};

function refreshKnowledgePage() {
  revalidatePath(KNOWLEDGE_ADMIN_PATH);
}

async function loadKnowledgeSource(
  admin: KnowledgeAdminClient,
  sourceId: string,
): Promise<StoredKnowledgeSource | null> {
  const { data, error } = await admin
    .from("knowledge_sources")
    .select(
      "id,storage_bucket,storage_path,status,title,original_filename,mime_type,declared_size_bytes,size_bytes,openai_file_id,vector_store_id,index_claim_token,index_lease_expires_at",
    )
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as StoredKnowledgeSource | null;
}

async function deleteVectorStoreBestEffort(vectorStoreId: string) {
  try {
    await deleteKnowledgeVectorStore(vectorStoreId);
  } catch (error) {
    console.error("Knowledge Library unused vector store cleanup failed", {
      message: error instanceof Error ? error.message : "Unknown vector store cleanup error",
    });
  }
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
  if (claimError) {
    await deleteVectorStoreBestEffort(createdId);
    throw new Error(claimError.message);
  }
  if (claimed?.vector_store_id === createdId) return createdId;

  const { data: winner, error: winnerError } = await admin
    .from("knowledge_library_config")
    .select("vector_store_id")
    .eq("library_key", "global")
    .maybeSingle();
  if (winnerError || !winner?.vector_store_id) {
    await deleteVectorStoreBestEffort(createdId);
    throw new Error(winnerError?.message ?? "Knowledge vector store was not persisted");
  }

  if (winner.vector_store_id !== createdId) {
    await deleteVectorStoreBestEffort(createdId);
  }
  return winner.vector_store_id as string;
}

async function claimKnowledgeSourceIndex(
  admin: KnowledgeAdminClient,
  actorId: string,
  sourceId: string,
  sizeBytes: number,
): Promise<KnowledgeIndexClaim> {
  const { data, error } = await admin.rpc("claim_knowledge_source_index", {
    p_source_id: sourceId,
    p_created_by: actorId,
    p_size_bytes: sizeBytes,
    p_lease_seconds: KNOWLEDGE_INDEX_LEASE_SECONDS,
  });
  if (error) throw new Error(error.message);

  const row = data?.[0];
  if (!row || typeof row.claim_state !== "string") {
    throw new Error("Knowledge index claim returned no state");
  }

  const state = row.claim_state as KnowledgeIndexClaim["state"];
  if (!["claimed", "busy", "provider_indexing", "ready", "deleting", "not_found", "not_claimable"].includes(state)) {
    throw new Error("Knowledge index claim returned an invalid state");
  }

  return {
    state,
    token: row.claim_token,
    previousOpenAIFileId: row.previous_openai_file_id,
    previousVectorStoreId: row.previous_vector_store_id,
  };
}

async function deleteOpenAIFileBestEffort(fileId: string) {
  try {
    await deleteKnowledgeOpenAIFile(fileId);
    return true;
  } catch (error) {
    console.error("Knowledge Library OpenAI file cleanup failed", {
      message: error instanceof Error ? error.message : "Unknown OpenAI file cleanup error",
    });
    return false;
  }
}

async function markClaimFailure(
  admin: KnowledgeAdminClient,
  sourceId: string,
  claimToken: string,
  sizeBytes: number,
  errorCode: string,
  openaiFileId: string | null = null,
  vectorStoreId: string | null = null,
) {
  const { data, error } = await admin
    .from("knowledge_sources")
    .update({
      status: "failed",
      size_bytes: sizeBytes,
      openai_file_id: openaiFileId,
      vector_store_id: openaiFileId ? vectorStoreId : null,
      last_error_code: errorCode.slice(0, 100) || "provider-error",
      indexed_at: null,
      index_claim_token: null,
      index_lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .eq("status", "indexing")
    .eq("index_claim_token", claimToken)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Knowledge Library failed-state persistence failed", {
      sourceId,
      code: error.code,
      message: error.message,
    });
    return false;
  }
  return Boolean(data);
}

async function markProviderFailure(
  admin: KnowledgeAdminClient,
  source: StoredKnowledgeSource,
  errorCode: string,
) {
  if (!source.size_bytes || !source.openai_file_id || !source.vector_store_id) return false;
  const deleted = await deleteOpenAIFileBestEffort(source.openai_file_id);
  const { data, error } = await admin
    .from("knowledge_sources")
    .update({
      status: "failed",
      size_bytes: source.size_bytes,
      openai_file_id: deleted ? null : source.openai_file_id,
      vector_store_id: deleted ? null : source.vector_store_id,
      last_error_code: errorCode.slice(0, 100) || "provider-error",
      indexed_at: null,
      index_claim_token: null,
      index_lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", source.id)
    .eq("status", "indexing")
    .is("index_claim_token", null)
    .eq("openai_file_id", source.openai_file_id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function persistClaimedProviderState(
  admin: KnowledgeAdminClient,
  sourceId: string,
  claimToken: string,
  sizeBytes: number,
  openaiFileId: string,
  vectorStoreId: string,
  ready: boolean,
) {
  const { data, error } = await admin
    .from("knowledge_sources")
    .update({
      status: ready ? "ready" : "indexing",
      size_bytes: sizeBytes,
      openai_file_id: openaiFileId,
      vector_store_id: vectorStoreId,
      last_error_code: null,
      indexed_at: ready ? new Date().toISOString() : null,
      index_claim_token: null,
      index_lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .eq("status", "indexing")
    .eq("index_claim_token", claimToken)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function indexStoredSource(
  admin: KnowledgeAdminClient,
  source: StoredKnowledgeSource,
  sizeBytes: number,
  claimToken: string,
  previousOpenAIFileId: string | null,
  previousVectorStoreId: string | null,
): Promise<"indexing" | "ready" | null> {
  let vectorStoreId: string | null = null;
  let openaiFileId: string | null = null;

  try {
    if (previousOpenAIFileId) {
      const previousDeleted = await deleteOpenAIFileBestEffort(previousOpenAIFileId);
      if (!previousDeleted) {
        await markClaimFailure(
          admin,
          source.id,
          claimToken,
          sizeBytes,
          "previous-file-cleanup-failed",
          previousOpenAIFileId,
          previousVectorStoreId,
        );
        refreshKnowledgePage();
        return null;
      }
    }

    vectorStoreId = await ensureKnowledgeVectorStore(admin);
    const { data: sourceBlob, error: downloadError } = await admin.storage
      .from(source.storage_bucket)
      .download(
        source.storage_path,
        {},
        { signal: AbortSignal.timeout(KNOWLEDGE_STORAGE_DOWNLOAD_TIMEOUT_MS) },
      );
    if (downloadError || !sourceBlob) {
      throw new Error(downloadError?.message ?? "Knowledge source could not be downloaded");
    }

    const file = new File([sourceBlob], source.original_filename, { type: source.mime_type });
    openaiFileId = await createKnowledgeOpenAIFile(file);
    const vectorFile = await attachKnowledgeVectorStoreFile(
      vectorStoreId,
      openaiFileId,
      source.id,
      claimToken,
      source.title,
    );

    if (vectorFile.status === "failed" || vectorFile.status === "cancelled") {
      const errorCode = vectorFile.last_error?.code ?? vectorFile.status;
      const deleted = await deleteOpenAIFileBestEffort(openaiFileId);
      const persisted = await markClaimFailure(
        admin,
        source.id,
        claimToken,
        sizeBytes,
        errorCode,
        deleted ? null : openaiFileId,
        deleted ? null : vectorStoreId,
      );
      if (!persisted && !deleted) await deleteOpenAIFileBestEffort(openaiFileId);
      refreshKnowledgePage();
      return null;
    }

    const ready = vectorFile.status === "completed";
    const persisted = await persistClaimedProviderState(
      admin,
      source.id,
      claimToken,
      sizeBytes,
      openaiFileId,
      vectorStoreId,
      ready,
    );
    if (!persisted) {
      const deleted = await deleteOpenAIFileBestEffort(openaiFileId);
      if (deleted) openaiFileId = null;
      throw new Error("Knowledge index claim expired or was superseded");
    }

    refreshKnowledgePage();
    return ready ? "ready" : "indexing";
  } catch (error) {
    if (openaiFileId) {
      const deleted = await deleteOpenAIFileBestEffort(openaiFileId);
      if (deleted) openaiFileId = null;
    }
    console.error("Knowledge Library indexing failed", {
      sourceId: source.id,
      message: error instanceof Error ? error.message : "Unknown indexing error",
    });
    await markClaimFailure(
      admin,
      source.id,
      claimToken,
      sizeBytes,
      knowledgeProviderErrorCode(error),
      openaiFileId,
      openaiFileId ? vectorStoreId : null,
    );
    refreshKnowledgePage();
    return null;
  }
}

function claimStatusResult(
  claim: KnowledgeIndexClaim,
): "indexing" | "ready" | null {
  if (claim.state === "ready") return "ready";
  if (claim.state === "busy" || claim.state === "provider_indexing") return "indexing";
  return null;
}

async function executeClaimedIndex(
  admin: KnowledgeAdminClient,
  actorId: string,
  source: StoredKnowledgeSource,
  sizeBytes: number,
): Promise<"indexing" | "ready" | null> {
  const claim = await claimKnowledgeSourceIndex(admin, actorId, source.id, sizeBytes);
  const existingStatus = claimStatusResult(claim);
  if (existingStatus) return existingStatus;
  if (claim.state !== "claimed" || !claim.token) return null;

  return indexStoredSource(
    admin,
    source,
    sizeBytes,
    claim.token,
    claim.previousOpenAIFileId,
    claim.previousVectorStoreId,
  );
}

/** Creates an Admin-authored Knowledge source and a signed private Storage upload token. */
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

/** Verifies the private object, atomically claims the global source, then starts File Search indexing. */
export async function finalizeKnowledgeUploadAction(input: unknown): Promise<KnowledgeFinalizeResult> {
  const authorization = await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };

  const admin = getKnowledgeAdminClient();
  let source: StoredKnowledgeSource | null;
  try {
    source = await loadKnowledgeSource(admin, sourceId);
  } catch (error) {
    console.error("Knowledge Library finalization failed", {
      stage: "load",
      message: error instanceof Error ? error.message : "Unknown load error",
    });
    return { ok: false, error: "index-failed" };
  }
  if (!source) return { ok: false, error: "not-found" };
  if (source.status === "ready") return { ok: true, sourceId, status: "ready" };
  if (source.status === "failed" || source.status === "deleting") {
    return { ok: false, error: "index-failed" };
  }

  let sizeBytes = source.size_bytes;
  if (source.status === "pending") {
    const { data: storedObject, error: infoError } = await admin.storage
      .from(source.storage_bucket)
      .info(source.storage_path);
    if (infoError || !storedObject) return { ok: false, error: "verify-failed" };

    const verifiedSize = Number(storedObject.size);
    const contentType = storedObject.contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (
      !Number.isSafeInteger(verifiedSize) ||
      verifiedSize <= 0 ||
      verifiedSize > KNOWLEDGE_LIBRARY_MAX_BYTES ||
      verifiedSize !== source.declared_size_bytes ||
      contentType !== source.mime_type
    ) {
      return { ok: false, error: "verify-failed" };
    }
    sizeBytes = verifiedSize;
  }

  if (!sizeBytes) return { ok: false, error: "index-failed" };

  try {
    const status = await executeClaimedIndex(
      admin,
      authorization.userId,
      source,
      sizeBytes,
    );
    return status
      ? { ok: true, sourceId, status }
      : { ok: false, error: "index-failed" };
  } catch (error) {
    console.error("Knowledge Library claim/finalization failed", {
      sourceId,
      message: error instanceof Error ? error.message : "Unknown claim error",
    });
    return { ok: false, error: "index-failed" };
  }
}

/** Refreshes provider indexing or reclaims a worker whose indexing lease expired. */
export async function refreshKnowledgeSourceAction(input: unknown): Promise<KnowledgeMutationResult> {
  const authorization = await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };
  const admin = getKnowledgeAdminClient();
  const source = await loadKnowledgeSource(admin, sourceId).catch(() => null);
  if (!source) return { ok: false, error: "not-found" };
  if (source.status === "ready") return { ok: true, status: "ready" };
  if (source.status !== "indexing" || !source.size_bytes) {
    return { ok: false, error: "operation-failed" };
  }

  try {
    if (source.index_claim_token) {
      const leaseExpiresAt = source.index_lease_expires_at
        ? Date.parse(source.index_lease_expires_at)
        : Number.NaN;
      if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now()) {
        return { ok: true, status: "indexing" };
      }

      const status = await executeClaimedIndex(
        admin,
        authorization.userId,
        source,
        source.size_bytes,
      );
      return status ? { ok: true, status } : { ok: true, status: "failed" };
    }

    if (!source.openai_file_id || !source.vector_store_id) {
      return { ok: false, error: "operation-failed" };
    }

    const providerState = await retrieveKnowledgeVectorStoreFile(
      source.vector_store_id,
      source.openai_file_id,
    );
    if (providerState.status === "in_progress") return { ok: true, status: "indexing" };
    if (providerState.status === "completed") {
      const { data, error } = await admin
        .from("knowledge_sources")
        .update({
          status: "ready",
          indexed_at: new Date().toISOString(),
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id)
        .eq("status", "indexing")
        .is("index_claim_token", null)
        .eq("openai_file_id", source.openai_file_id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return { ok: true, status: "indexing" };
      refreshKnowledgePage();
      return { ok: true, status: "ready" };
    }

    await markProviderFailure(
      admin,
      source,
      providerState.last_error?.code ?? providerState.status,
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

/** Rebuilds the provider index for a failed global source through the same atomic claim fence. */
export async function retryKnowledgeIndexAction(input: unknown): Promise<KnowledgeMutationResult> {
  const authorization = await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };
  const admin = getKnowledgeAdminClient();
  const source = await loadKnowledgeSource(admin, sourceId).catch(() => null);
  if (!source) return { ok: false, error: "not-found" };
  if (source.status !== "failed" || !source.size_bytes) {
    return { ok: false, error: "operation-failed" };
  }

  try {
    const status = await executeClaimedIndex(
      admin,
      authorization.userId,
      source,
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

/** Atomically fences active indexing before deleting a global source and its derived provider file. */
export async function deleteKnowledgeSourceAction(input: unknown): Promise<KnowledgeMutationResult> {
  await requireAdmin();
  const sourceId = validateKnowledgeSourceId(input);
  if (!sourceId) return { ok: false, error: "invalid-request" };
  const admin = getKnowledgeAdminClient();

  const { data: claimRows, error: claimError } = await admin.rpc("claim_knowledge_source_delete", {
    p_source_id: sourceId,
  });
  if (claimError) return { ok: false, error: "operation-failed" };

  const claimState = claimRows?.[0]?.claim_state;
  if (claimState === "not_found") return { ok: true };
  if (claimState === "busy") return { ok: false, error: "operation-failed" };
  if (claimState !== "claimed" && claimState !== "deleting") {
    return { ok: false, error: "operation-failed" };
  }

  const source = await loadKnowledgeSource(admin, sourceId).catch(() => null);
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
