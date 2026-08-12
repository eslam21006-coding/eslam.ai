import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type TeachEslamDraftSummary = {
  id: string;
  title: string;
  semanticLayer: string;
  itemType: string;
  priority: number;
  versionNumber: 1;
};

const MAX_RECENT_TEACH_ESLAM_DRAFTS = 20;

function logDraftLoadError(stage: string, error: { code?: string; message?: string } | null) {
  console.error("Teach Eslam draft load failed", {
    stage,
    code: error?.code,
    message: error?.message ?? "Unknown draft load error",
  });
}

export async function loadTeachEslamDrafts(): Promise<TeachEslamDraftSummary[]> {
  const authorization = await requireAdmin();
  const admin = getSupabaseAdminClient();

  const { data: items, error: itemsError } = await admin
    .from("eslam_brain_items")
    .select("id,semantic_layer,item_type,priority,created_at")
    .eq("created_by", authorization.userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(MAX_RECENT_TEACH_ESLAM_DRAFTS);

  if (itemsError) {
    logDraftLoadError("items", itemsError);
    return [];
  }

  if (!items?.length) return [];

  const itemIds = items.map((item) => item.id);
  const { data: versions, error: versionsError } = await admin
    .from("eslam_brain_versions")
    .select("item_id,version_number,title")
    .in("item_id", itemIds)
    .eq("version_number", 1);

  if (versionsError) {
    logDraftLoadError("versions", versionsError);
    return [];
  }

  const titleByItemId = new Map(
    (versions ?? []).map((version) => [version.item_id, version.title] as const),
  );

  return items.flatMap((item) => {
    const title = titleByItemId.get(item.id);
    if (!title) return [];

    return [
      {
        id: item.id,
        title,
        semanticLayer: item.semantic_layer,
        itemType: item.item_type,
        priority: item.priority,
        versionNumber: 1 as const,
      },
    ];
  });
}
