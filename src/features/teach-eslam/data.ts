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
  const itemIds = items.map((item) => item.id);
  const { data: versions, error: versionsError } = await admin
    .from("eslam_brain_versions")
    .select("item_id,version_number,title")
    .in("item_id", itemIds)
    .eq("version_number", 1);

  if (versionsError) {
    logDraftLoadError("versions", versionsError);
    return emptyPage();
  }

  const titleByItemId = new Map(
    (versions ?? []).map((version) => [version.item_id, version.title] as const),
  );

  const drafts = items.flatMap((item) => {
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

  return {
    drafts,
    page: normalizedPage,
    hasPreviousPage: normalizedPage > 1,
    hasNextPage,
  };
}
