import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type TeachEslamDraftSummary = {
  id: string;
  title: string;
  semanticLayer: string;
  itemType: string;
  priority: number;
  versionNumber: number;
  directPublishEligible: boolean;
};

export type TeachEslamDraftPage = {
  drafts: TeachEslamDraftSummary[];
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

const TEACH_ESLAM_DRAFT_PAGE_SIZE = 20;

function logDraftLoadError(stage: string, error: { code?: string; message?: string } | null) {
  console.error("Teach Eslam draft load failed", {
    stage,
    code: error?.code,
    message: error?.message ?? "Unknown draft load error",
  });
}

export async function loadTeachEslamDrafts(page = 1): Promise<TeachEslamDraftPage> {
  const authorization = await requireAdmin();
  const admin = getSupabaseAdminClient();
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (normalizedPage - 1) * TEACH_ESLAM_DRAFT_PAGE_SIZE;

  const { data: rows, error: itemsError } = await admin
    .from("eslam_brain_items")
    .select("id,semantic_layer,item_type,priority,created_at")
    .eq("created_by", authorization.userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + TEACH_ESLAM_DRAFT_PAGE_SIZE);

  const emptyPage = (): TeachEslamDraftPage => ({
    drafts: [],
    page: normalizedPage,
    hasPreviousPage: normalizedPage > 1,
    hasNextPage: false,
  });

  if (itemsError) {
    logDraftLoadError("items", itemsError);
    return emptyPage();
  }

  if (!rows?.length) return emptyPage();

  const hasNextPage = rows.length > TEACH_ESLAM_DRAFT_PAGE_SIZE;
  const items = rows.slice(0, TEACH_ESLAM_DRAFT_PAGE_SIZE);

  const versionResults = await Promise.all(
    items.map(async (item) => {
      const { data, error } = await admin
        .from("eslam_brain_versions")
        .select("item_id,version_number,title")
        .eq("item_id", item.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      return { itemId: item.id, data, error };
    }),
  );

  const latestVersionByItemId = new Map<
    string,
    { versionNumber: number; title: string }
  >();

  for (const result of versionResults) {
    if (result.error) {
      logDraftLoadError(`version:${result.itemId}`, result.error);
      continue;
    }
    if (!result.data) continue;
    latestVersionByItemId.set(result.itemId, {
      versionNumber: result.data.version_number,
      title: result.data.title,
    });
  }

  const drafts = items.flatMap((item) => {
    const latestVersion = latestVersionByItemId.get(item.id);
    if (!latestVersion) return [];

    return [
      {
        id: item.id,
        title: latestVersion.title,
        semanticLayer: item.semantic_layer,
        itemType: item.item_type,
        priority: item.priority,
        versionNumber: latestVersion.versionNumber,
        directPublishEligible: latestVersion.versionNumber === 1,
      },
    ];
  });

  return {
    drafts,
    page: normalizedPage,
    hasPreviousPage: normalizedPage > 1,
    hasNextPage,
  };
}
