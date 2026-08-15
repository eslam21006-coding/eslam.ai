import "server-only";

import { KNOWLEDGE_LIBRARY_VECTOR_STORE_NAME } from "@/features/knowledge-library/core";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const OPENAI_KNOWLEDGE_TIMEOUT_MS = 90_000;

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

async function openAIRequest<T>(
  path: string,
  init: RequestInit,
  options: { beta?: boolean; allowNotFound?: boolean } = {},
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_KNOWLEDGE_TIMEOUT_MS);

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
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new KnowledgeProviderError(`OpenAI request failed with status ${response.status}`, {
        status: response.status,
        code: providerCode(payload),
      });
    }
    return payload as T;
  } catch (error) {
    if (error instanceof KnowledgeProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
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

/** Attaches an uploaded OpenAI file to the global Knowledge Library vector store. */
export async function attachKnowledgeVectorStoreFile(
  vectorStoreId: string,
  fileId: string,
  sourceId: string,
  title: string,
) {
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
}

/** Reads the provider indexing status for one Knowledge Library file. */
export async function retrieveKnowledgeVectorStoreFile(vectorStoreId: string, fileId: string) {
  const payload = await openAIRequest<VectorStoreFileState>(
    `/vector_stores/${encodeURIComponent(vectorStoreId)}/files/${encodeURIComponent(fileId)}`,
    { method: "GET" },
    { beta: true },
  );
  if (!payload) throw new KnowledgeProviderError("Vector store file was not found", { code: "not-found" });
  return payload;
}

/** Deletes the durable OpenAI File; OpenAI also removes it from every vector store. */
export async function deleteKnowledgeOpenAIFile(fileId: string) {
  await openAIRequest<{ deleted?: boolean }>(
    `/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
    { allowNotFound: true },
  );
}

export function knowledgeProviderErrorCode(error: unknown) {
  return error instanceof KnowledgeProviderError ? error.code.slice(0, 100) : "provider-error";
}
