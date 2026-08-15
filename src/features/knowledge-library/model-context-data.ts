import "server-only";

import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";

const KNOWLEDGE_CONFIG_TIMEOUT_MS = 2_000;

/** Resolves the ready global Knowledge vector store for chat and fails open on any dependency error. */
export async function loadKnowledgeVectorStoreId() {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const admin = getKnowledgeAdminClient();
    const query = Promise.all([
      admin
        .from("knowledge_library_config")
        .select("vector_store_id")
        .eq("library_key", "global")
        .abortSignal(controller.signal)
        .maybeSingle(),
      admin
        .from("knowledge_sources")
        .select("id,vector_store_id")
        .eq("status", "ready")
        .not("vector_store_id", "is", null)
        .limit(1)
        .abortSignal(controller.signal),
    ]);
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

    const [configResult, readyResult] = result;
    if (configResult.error || readyResult.error) {
      console.error("knowledge_library search config load failed", {
        configError: configResult.error?.message,
        readyError: readyResult.error?.message,
      });
      return null;
    }

    const vectorStoreId =
      configResult.data && typeof configResult.data.vector_store_id === "string"
        ? configResult.data.vector_store_id
        : null;
    const readyStoreId =
      readyResult.data?.[0] && typeof readyResult.data[0].vector_store_id === "string"
        ? readyResult.data[0].vector_store_id
        : null;

    return vectorStoreId && vectorStoreId === readyStoreId ? vectorStoreId : null;
  } catch (error) {
    console.error("knowledge_library search config load failed", {
      message: error instanceof Error ? error.message : "Unknown Knowledge Library load error",
    });
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
