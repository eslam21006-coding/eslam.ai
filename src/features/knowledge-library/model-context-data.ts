import "server-only";

import {
  getKnowledgeAdminClient,
  invalidateMissingKnowledgeVectorStore,
} from "@/features/knowledge-library/database";
import { retrieveKnowledgeVectorStore } from "@/features/knowledge-library/openai";

const KNOWLEDGE_CONFIG_TIMEOUT_MS = 2_000;
const KNOWLEDGE_PROVIDER_CHECK_TIMEOUT_MS = 1_500;

/** Resolves the global Knowledge vector store from one atomic database snapshot and verifies provider existence. */
export async function loadKnowledgeVectorStoreId() {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const admin = getKnowledgeAdminClient();
    const query = admin
      .rpc("get_knowledge_retrieval_state", {})
      .abortSignal(controller.signal)
      .maybeSingle();
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        resolve(null);
        controller.abort();
      }, KNOWLEDGE_CONFIG_TIMEOUT_MS);
    });

    const result = await Promise.race([query, deadline]);
    if (result === null) {
      console.error("knowledge_library search config load timed out", {
        timeoutMs: KNOWLEDGE_CONFIG_TIMEOUT_MS,
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

    const providerStoreId = await retrieveKnowledgeVectorStore(
      vectorStoreId,
      KNOWLEDGE_PROVIDER_CHECK_TIMEOUT_MS,
    );
    if (!providerStoreId) {
      await invalidateMissingKnowledgeVectorStore(vectorStoreId);
      console.error("knowledge_library configured vector store is missing", {
        vectorStoreId,
      });
      return null;
    }

    return vectorStoreId;
  } catch (error) {
    console.error("knowledge_library search config load failed", {
      message: error instanceof Error ? error.message : "Unknown Knowledge Library load error",
    });
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
