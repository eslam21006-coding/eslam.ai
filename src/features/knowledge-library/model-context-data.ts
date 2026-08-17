import "server-only";

import {
  getKnowledgeAdminClient,
  invalidateMissingKnowledgeVectorStore,
} from "@/features/knowledge-library/database";
import { retrieveKnowledgeVectorStore } from "@/features/knowledge-library/openai";

const KNOWLEDGE_CONFIG_TIMEOUT_MS = 2_000;
const KNOWLEDGE_CONFIG_RETRY_TIMEOUT_MS = 3_000;
const KNOWLEDGE_PROVIDER_CHECK_TIMEOUT_MS = 5_000;
const KNOWLEDGE_PROVIDER_CHECK_TTL_MS = 60_000;

let verifiedStore: { id: string; checkedAt: number } | null = null;

/** Resolves the global Knowledge vector store from one atomic database snapshot and verifies provider existence. */
export async function loadKnowledgeVectorStoreId() {
  try {
    const admin = getKnowledgeAdminClient();

    const loadRetrievalState = async (timeoutMs: number) => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const query = admin
          .rpc("get_knowledge_retrieval_state", {})
          .abortSignal(controller.signal)
          .maybeSingle();
        const deadline = new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            resolve(null);
            controller.abort();
          }, timeoutMs);
        });
        return await Promise.race([query, deadline]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    };

    let result = await loadRetrievalState(KNOWLEDGE_CONFIG_TIMEOUT_MS);
    if (result === null) {
      console.warn("knowledge_library initial search config load timed out; retrying", {
        timeoutMs: KNOWLEDGE_CONFIG_TIMEOUT_MS,
      });
      result = await loadRetrievalState(KNOWLEDGE_CONFIG_RETRY_TIMEOUT_MS);
    }

    if (result === null) {
      console.error("knowledge_library search config load timed out", {
        timeoutMs: KNOWLEDGE_CONFIG_TIMEOUT_MS + KNOWLEDGE_CONFIG_RETRY_TIMEOUT_MS,
      });
      return null;
    }

    if (result.error) {
      console.error("knowledge_library search config load failed", {
        message: result.error.message,
      });
      return null;
    }

    const vectorStoreId =
      result.data && typeof result.data.vector_store_id === "string"
        ? result.data.vector_store_id
        : null;
    if (!vectorStoreId) return null;

    if (
      verifiedStore?.id === vectorStoreId &&
      Date.now() - verifiedStore.checkedAt < KNOWLEDGE_PROVIDER_CHECK_TTL_MS
    ) {
      return vectorStoreId;
    }

    const providerStoreId = await retrieveKnowledgeVectorStore(
      vectorStoreId,
      KNOWLEDGE_PROVIDER_CHECK_TIMEOUT_MS,
    );
    if (!providerStoreId) {
      verifiedStore = null;
      await invalidateMissingKnowledgeVectorStore(vectorStoreId);
      console.error("knowledge_library configured vector store is missing", {
        vectorStoreId,
      });
      return null;
    }

    verifiedStore = { id: vectorStoreId, checkedAt: Date.now() };
    return vectorStoreId;
  } catch (error) {
    console.error("knowledge_library search config load failed", {
      message: error instanceof Error ? error.message : "Unknown Knowledge Library load error",
    });
    return null;
  }
}
