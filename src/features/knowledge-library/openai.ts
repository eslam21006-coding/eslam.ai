import "server-only";

import { KNOWLEDGE_LIBRARY_VECTOR_STORE_NAME } from "@/features/knowledge-library/core";
import {
  getKnowledgeAdminClient,
  invalidateMissingKnowledgeVectorStore,
} from "@/features/knowledge-library/database";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const OPENAI_KNOWLEDGE_TIMEOUT_MS = 90_000;
const OPENAI_KNOWLEDGE_CONFIRM_TIMEOUT_MS = 15_000;
const KNOWLEDGE_INDEX_LEASE_MS = 180_000;

type VectorStoreFileState = {
  id: string;
  vector_store_id: string;
  status: "in_progress" | "completed" | "cancelled" | "failed";
  last_error: { code?: string; message?: string } | null;
};

export class KnowledgeProviderError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(message: string, options: { status?: number | null; code?: string } = {}) {
    super(message);
    this.name = "KnowledgeProviderError";
    this.status = options.status ?? null;
    this.code = options.code ?? "provider-error";
  }
}

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new KnowledgeProviderError("OPENAI_API_KEY is not configured", { code: "config" });
  return apiKey;
}

function providerCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return "provider-error";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "provider-error";
  const code = (error as { code?: unknown; type?: unknown }).code ??
    (error as { type?: unknown }).type;
  return typeof code === "string" && code.trim() ? code.slice(0, 100) : "provider-error";
}

function isAbortError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const causeName = error.cause instanceof Error ? error.cause.name : null;
  return error.name === "AbortError" || causeName === "AbortError";
}

async function openAIRequest<T>(
  path: string,
  init: RequestInit,
  options: { beta?: boolean; allowNotFound?: boolean; timeoutMs?: number } = {},
): Promise<T | null> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? OPENAI_KNOWLEDGE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${getApiKey()}`);
    if (options.beta) headers.set("OpenAI-Beta", "assistants=v2");
    if (typeof init.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${OPENAI_API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (options.allowNotFound && response.status === 404) return null;

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch (bodyError) {
      // An abort can arrive while the body is being consumed after fetch() has resolved.
      // Preserve that rejection so the outer boundary can classify the request as timed out.
      if (controller.signal.aborted && isAbortError(bodyError)) throw bodyError;
    }

    if (!response.ok) {
      throw new KnowledgeProviderError(`OpenAI request failed with status ${response.status}`, {
        status: response.status,
        code: providerCode(payload),
      });
    }
    return payload as T;
  } catch (error) {
    if (error instanceof KnowledgeProviderError) throw error;
    if (controller.signal.aborted && isAbortError(error)) {
      throw new KnowledgeProviderError("OpenAI Knowledge request timed out", { code: "timeout" });
    }
    throw new KnowledgeProviderError(
      error instanceof Error ? error.message : "OpenAI Knowledge request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Creates the single global vector store used by Eslam.AI Knowledge retrieval. */
export async function createKnowledgeVectorStore() {
  const payload = await openAIRequest<{ id?: unknown }>(
    "/vector_stores",
    {
      method: "POST",
      body: JSON.stringify({ name: KNOWLEDGE_LIBRARY_VECTOR_STORE_NAME }),
    },
    { beta: true },
  );
  const id = payload && typeof payload.id === "string" ? payload.id : null;
  if (!id) throw new KnowledgeProviderError("OpenAI vector store response had no id", { code: "invalid-response" });
  return id;
}

/** Confirms that a configured provider vector store still exists; provider 404 returns null. */
export async function retrieveKnowledgeVectorStore(
  vectorStoreId: string,
  timeoutMs = OPENAI_KNOWLEDGE_TIMEOUT_MS,
) {
  const payload = await openAIRequest<{ id?: unknown }>(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}`,
    { method: "GET" },
    { beta: true, allowNotFound: true, timeoutMs },
  );
  if (!payload) return null;
  const id = typeof payload.id === "string" ? payload.id : null;
  if (!id) {
    throw new KnowledgeProviderError("OpenAI vector store response had no id", {
      code: "invalid-response",
    });
  }
  return id;
}

/** Deletes an unused vector store created by a lost singleton-creation race. */
export async function deleteKnowledgeVectorStore(vectorStoreId: string) {
  await openAIRequest<{ deleted?: boolean }>(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}`,
    { method: "DELETE" },
    { beta: true, allowNotFound: true },
  );
}

/** Uploads a durable Knowledge Library file to OpenAI for later vector-store indexing. */
export async function createKnowledgeOpenAIFile(file: File) {
  const body = new FormData();
  body.set("purpose", "assistants");
  body.set("file", file);
  const payload = await openAIRequest<{ id?: unknown }>("/files", { method: "POST", body });
  const id = payload && typeof payload.id === "string" ? payload.id : null;
  if (!id) throw new KnowledgeProviderError("OpenAI file response had no id", { code: "invalid-response" });
  return id;
}

/**
 * Records the replacement provider IDs under the exact active index claim before attaching the file.
 * A reclaimed row may still carry the previous cleanup pointer; only the exact claimant may replace it after cleanup.
 */
async function persistClaimedProviderIds(
  sourceId: string,
  claimToken: string,
  vectorStoreId: string,
  fileId: string,
) {
  const admin = getKnowledgeAdminClient();
  const { data, error } = await admin
    .from("knowledge_sources")
    .update({
      openai_file_id: fileId,
      vector_store_id: vectorStoreId,
      index_lease_expires_at: new Date(Date.now() + KNOWLEDGE_INDEX_LEASE_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .eq("status", "indexing")
    .eq("index_claim_token", claimToken)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new KnowledgeProviderError("Knowledge provider IDs could not be persisted", {
      code: "provider-id-persist-failed",
    });
  }
  if (!data) {
    throw new KnowledgeProviderError("Knowledge index claim is no longer active", {
      code: "claim-lost",
    });
  }
}

async function invalidateMissingStoreBestEffort(vectorStoreId: string) {
  try {
    await invalidateMissingKnowledgeVectorStore(vectorStoreId);
  } catch (error) {
    console.error("Knowledge Library missing vector store invalidation failed", {
      vectorStoreId,
      message: error instanceof Error ? error.message : "Unknown vector store invalidation error",
    });
  }
}

/** Attaches an uploaded OpenAI file only after its provider IDs are durably tracked by the exact active claim. */
export async function attachKnowledgeVectorStoreFile(
  vectorStoreId: string,
  fileId: string,
  sourceId: string,
  claimToken: string,
  title: string,
) {
  await persistClaimedProviderIds(sourceId, claimToken, vectorStoreId, fileId);

  try {
    const payload = await openAIRequest<VectorStoreFileState>(
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/files`,
      {
        method: "POST",
        body: JSON.stringify({
          file_id: fileId,
          attributes: { source_id: sourceId, title },
        }),
      },
      { beta: true },
    );
    if (!payload) throw new KnowledgeProviderError("Vector store file response was empty", { code: "invalid-response" });
    return payload;
  } catch (error) {
    if (error instanceof KnowledgeProviderError && error.status === 404) {
      await invalidateMissingStoreBestEffort(vectorStoreId);
      throw new KnowledgeProviderError("Knowledge vector store is missing", {
        status: 404,
        code: "vector-store-not-found",
      });
    }
    throw error;
  }
}

/** Reads provider indexing state; a missing file is surfaced as a retryable failed state. */
export async function retrieveKnowledgeVectorStoreFile(vectorStoreId: string, fileId: string) {
  const payload = await openAIRequest<VectorStoreFileState>(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
    { method: "GET" },
    { beta: true, allowNotFound: true },
  );
  return (
    payload ?? {
      id: fileId,
      vector_store_id: vectorStoreId,
      status: "failed" as const,
      last_error: { code: "not-found", message: "Provider file is missing" },
    }
  );
}

/** Removes a file from File Search and confirms the vector-store attachment is actually gone. */
async function deleteKnowledgeVectorStoreFile(vectorStoreId: string, fileId: string) {
  await openAIRequest<{ deleted?: boolean }>(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
    { beta: true, allowNotFound: true },
  );

  const remaining = await openAIRequest<VectorStoreFileState>(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
    { method: "GET" },
    {
      beta: true,
      allowNotFound: true,
      timeoutMs: OPENAI_KNOWLEDGE_CONFIRM_TIMEOUT_MS,
    },
  );
  if (remaining) {
    throw new KnowledgeProviderError("Knowledge vector-store file deletion was not confirmed", {
      code: "vector-file-delete-not-confirmed",
    });
  }
}

/** Resolves the best known vector-store cleanup pointer for a tracked OpenAI file. */
async function resolveKnowledgeCleanupVectorStoreId(fileId: string) {
  const admin = getKnowledgeAdminClient();
  const { data: source, error: sourceError } = await admin
    .from("knowledge_sources")
    .select("vector_store_id")
    .eq("openai_file_id", fileId)
    .maybeSingle();
  if (sourceError) {
    throw new KnowledgeProviderError("Knowledge provider cleanup pointer could not be loaded", {
      code: "cleanup-pointer-load-failed",
    });
  }
  if (source?.vector_store_id) return source.vector_store_id as string;

  const { data: config, error: configError } = await admin
    .from("knowledge_library_config")
    .select("vector_store_id")
    .eq("library_key", "global")
    .maybeSingle();
  if (configError) {
    throw new KnowledgeProviderError("Knowledge global cleanup pointer could not be loaded", {
      code: "cleanup-pointer-load-failed",
    });
  }
  return config?.vector_store_id && typeof config.vector_store_id === "string"
    ? config.vector_store_id
    : null;
}

/** Deletes the durable OpenAI File only after its best-known File Search attachment is confirmed absent. */
export async function deleteKnowledgeOpenAIFile(fileId: string) {
  const vectorStoreId = await resolveKnowledgeCleanupVectorStoreId(fileId);
  if (vectorStoreId) {
    await deleteKnowledgeVectorStoreFile(vectorStoreId, fileId);
  }

  await openAIRequest<{ deleted?: boolean }>(
    `/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
    { allowNotFound: true },
  );

  const remainingFile = await openAIRequest<{ id?: unknown }>(
    `/files/${encodeURIComponent(fileId)}`,
    { method: "GET" },
    {
      allowNotFound: true,
      timeoutMs: OPENAI_KNOWLEDGE_CONFIRM_TIMEOUT_MS,
    },
  );
  if (remainingFile) {
    throw new KnowledgeProviderError("Knowledge OpenAI file deletion was not confirmed", {
      code: "file-delete-not-confirmed",
    });
  }
}

export function knowledgeProviderErrorCode(error: unknown) {
  return error instanceof KnowledgeProviderError ? error.code.slice(0, 100) : "provider-error";
}
