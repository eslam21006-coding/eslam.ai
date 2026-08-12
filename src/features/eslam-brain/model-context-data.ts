import "server-only";

import {
  buildBoundedEslamBrainContext,
  MAX_ESLAM_BRAIN_QUERY_ITEMS,
  resolvePublishedEslamBrainItems,
  type PublishedBrainQueryRow,
} from "@/features/eslam-brain/model-context-core";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("eslam_brain_items")
      .select(ESLAM_BRAIN_SELECT)
      .eq("status", "published")
      .not("published_version_number", "is", null)
      .order("priority", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_ESLAM_BRAIN_QUERY_ITEMS);

    if (error) {
      console.error("eslam_brain model context load failed", errorSummary(error));
      return null;
    }

    const rows = (data ?? []) as unknown as PublishedBrainQueryRow[];
    return buildBoundedEslamBrainContext(resolvePublishedEslamBrainItems(rows));
  } catch (error) {
    console.error("eslam_brain model context load failed", errorSummary(error));
    return null;
  }
}
