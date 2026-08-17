type ProviderErrorShape = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  error?: {
    code?: unknown;
    type?: unknown;
    message?: unknown;
  };
};

const KNOWLEDGE_TOOL_ERROR_PATTERN = /(?:file[_\s-]?search|vector[_\s-]?store)/i;
const RETRYABLE_KNOWLEDGE_STATUSES = new Set([400, 404, 409, 422]);

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Detects provider failures that specifically invalidate the optional Knowledge file-search tool. */
export function isRetryableKnowledgeToolError(
  error: unknown,
  knowledgeVectorStoreId: string | null,
) {
  if (!knowledgeVectorStoreId || !error || typeof error !== "object") return false;

  const shaped = error as ProviderErrorShape;
  const status = typeof shaped.status === "number" ? shaped.status : null;
  if (status !== null && !RETRYABLE_KNOWLEDGE_STATUSES.has(status)) return false;

  const details = [
    error instanceof Error ? error.message : "",
    stringValue(shaped.message),
    stringValue(shaped.code),
    stringValue(shaped.error?.code),
    stringValue(shaped.error?.type),
    stringValue(shaped.error?.message),
  ].join(" ");

  return KNOWLEDGE_TOOL_ERROR_PATTERN.test(details);
}

/**
 * Creates a response with Knowledge enabled first, then retries exactly once without file_search
 * only when the provider reports a Knowledge vector-store/tool failure before response creation.
 */
export async function createWithKnowledgeFallback<T>(
  knowledgeVectorStoreId: string | null,
  create: (activeKnowledgeVectorStoreId: string | null) => Promise<T>,
): Promise<T> {
  try {
    return await create(knowledgeVectorStoreId);
  } catch (error) {
    if (!isRetryableKnowledgeToolError(error, knowledgeVectorStoreId)) throw error;
    return create(null);
  }
}
