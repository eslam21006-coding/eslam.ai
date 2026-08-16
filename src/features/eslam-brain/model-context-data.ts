import "server-only";

import {
  buildBoundedEslamBrainContext,
  ESLAM_BRAIN_SEMANTIC_LAYERS,
  MAX_ESLAM_BRAIN_QUERY_ITEMS,
  resolvePublishedEslamBrainItems,
  type PublishedBrainQueryRow,
} from "@/features/eslam-brain/model-context-core";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const ESLAM_BRAIN_RETRIEVAL_TIMEOUT_MS = 8_000;

const ESLAM_BRAIN_SELECT: string = `
  id,
  semantic_layer,
  item_type,
  priority,
  published_version_number,
  published_version:eslam_brain_versions!eslam_brain_items_published_version_fk (
    version_number,
    title,
    content,
    summary,
    topics
  )
`;

function errorSummary(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "Unknown Eslam Brain load error",
    };
  }

  return { message: "Unknown Eslam Brain load error" };
}

export async function loadEslamBrainModelContext() {
  const abortController = new AbortController();
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    const supabase = getSupabaseAdminClient();
    const layerRetrieval = Promise.all(
      ESLAM_BRAIN_SEMANTIC_LAYERS.map(async (semanticLayer) => {
        const result = await supabase
          .from("eslam_brain_items")
          .select(ESLAM_BRAIN_SELECT)
          .eq("status", "published")
          .eq("semantic_layer", semanticLayer)
          .not("published_version_number", "is", null)
          .order("priority", { ascending: true })
          .order("id", { ascending: true })
          .limit(MAX_ESLAM_BRAIN_QUERY_ITEMS)
          .abortSignal(abortController.signal);

        return { semanticLayer, ...result };
      }),
    );

    const deadline = new Promise<null>((resolve) => {
      deadlineTimer = setTimeout(() => {
        resolve(null);
        abortController.abort();
      }, ESLAM_BRAIN_RETRIEVAL_TIMEOUT_MS);
    });

    const layerResults = await Promise.race([layerRetrieval, deadline]);
    if (layerResults === null) {
      console.error("eslam_brain model context load timed out", {
        timeoutMs: ESLAM_BRAIN_RETRIEVAL_TIMEOUT_MS,
      });
      return null;
    }

    const failedLayer = layerResults.find(({ error }) => error);
    if (failedLayer?.error) {
      console.error("eslam_brain model context load failed", {
        semanticLayer: failedLayer.semanticLayer,
        ...errorSummary(failedLayer.error),
      });
      return null;
    }

    const rows = layerResults.flatMap(
      ({ data }) => (data ?? []) as unknown as PublishedBrainQueryRow[],
    );
    return buildBoundedEslamBrainContext(resolvePublishedEslamBrainItems(rows));
  } catch (error) {
    console.error("eslam_brain model context load failed", errorSummary(error));
    return null;
  } finally {
    if (deadlineTimer !== undefined) {
      clearTimeout(deadlineTimer);
    }
  }
}
