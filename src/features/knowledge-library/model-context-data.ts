import "server-only";

import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";

const KNOWLEDGE_CONFIG_TIMEOUT_MS = 2_000;

/** Resolves the global Knowledge vector store from one atomic database snapshot. */
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

    return result.data && typeof result.data.vector_store_id === "string"
      ? result.data.vector_store_id
      : null;
  } catch (error) {
    console.error("knowledge_library search config load failed", {
      message: error instanceof Error ? error.message : "Unknown Knowledge Library load error",
    });
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
