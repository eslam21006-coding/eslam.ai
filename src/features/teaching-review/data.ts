import "server-only";

import type { TeachingLifecycleStatus, TeachingReviewStatus } from "@/features/teaching-review/core";
import { TEACHING_REVIEW_PAGE_SIZE } from "@/features/teaching-review/core";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type TeachingReviewSource = {
  id: string;
  type: string;
  title: string;
  uri: string | null;
  metadata: Json;
  locator: Json;
  createdAt: string;
};

export type TeachingReviewVersion = {
  versionNumber: number;
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
  changeNote: string | null;
  createdAt: string;
};

export type TeachingReviewItem = {
  id: string;
  semanticLayer: string;
  itemType: string;
  status: TeachingLifecycleStatus;
  priority: number;
  approvedVersionNumber: number | null;
  publishedVersionNumber: number | null;
  createdAt: string;
  updatedAt: string;
  latestVersion: TeachingReviewVersion;
  sources: TeachingReviewSource[];
};

export type TeachingReviewPage = {
  items: TeachingReviewItem[];
  status: TeachingReviewStatus;
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  counts: Record<TeachingLifecycleStatus, number>;
};

function logReviewLoadError(stage: string, error: { code?: string; message?: string } | null) {
  console.error("Teaching review load failed", {
    stage,
    code: error?.code,
    message: error?.message ?? "Unknown teaching review load error",
  });
}

function emptyCounts(): Record<TeachingLifecycleStatus, number> {
  return { draft: 0, approved: 0, published: 0, archived: 0 };
}

async function loadStatusCounts(userId: string) {
  const admin = getSupabaseAdminClient();
  const statuses: TeachingLifecycleStatus[] = ["draft", "approved", "published", "archived"];
  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await admin
        .from("eslam_brain_items")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)
        .eq("status", status);

      if (error) logReviewLoadError(`count:${status}`, error);
      return [status, error ? 0 : (count ?? 0)] as const;
    }),
  );

  return Object.fromEntries(results) as Record<TeachingLifecycleStatus, number>;
}

export async function loadTeachingReviewPage(
  status: TeachingReviewStatus,
  page: number,
): Promise<TeachingReviewPage> {
  const authorization = await requireAdmin();
  const admin = getSupabaseAdminClient();
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (normalizedPage - 1) * TEACHING_REVIEW_PAGE_SIZE;
  const countsPromise = loadStatusCounts(authorization.userId);

  const baseQuery = admin
    .from("eslam_brain_items")
    .select(
      "id,semantic_layer,item_type,status,priority,approved_version_number,published_version_number,created_at,updated_at",
    )
    .eq("created_by", authorization.userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });

  const filteredQuery = status === "all" ? baseQuery : baseQuery.eq("status", status);
  const { data: rows, error: itemsError } = await filteredQuery.range(
    offset,
    offset + TEACHING_REVIEW_PAGE_SIZE,
  );
  const counts = await countsPromise;

  const emptyPage = (): TeachingReviewPage => ({
    items: [],
    status,
    page: normalizedPage,
    hasPreviousPage: normalizedPage > 1,
    hasNextPage: false,
    counts: counts ?? emptyCounts(),
  });

  if (itemsError) {
    logReviewLoadError("items", itemsError);
    return emptyPage();
  }

  if (!rows?.length) return emptyPage();

  const hasNextPage = rows.length > TEACHING_REVIEW_PAGE_SIZE;
  const pageRows = rows.slice(0, TEACHING_REVIEW_PAGE_SIZE);
  const itemIds = pageRows.map((item) => item.id);

  const { data: versionRows, error: versionsError } = await admin
    .from("eslam_brain_versions")
    .select("item_id,version_number,title,content,summary,topics,change_note,created_at")
    .in("item_id", itemIds)
    .order("version_number", { ascending: false });

  if (versionsError) {
    logReviewLoadError("versions", versionsError);
    return emptyPage();
  }

  const latestVersionByItem = new Map<string, TeachingReviewVersion>();
  for (const version of versionRows ?? []) {
    const existing = latestVersionByItem.get(version.item_id);
    if (existing && existing.versionNumber >= version.version_number) continue;
    latestVersionByItem.set(version.item_id, {
      versionNumber: version.version_number,
      title: version.title,
      content: version.content,
      summary: version.summary,
      topics: version.topics,
      changeNote: version.change_note,
      createdAt: version.created_at,
    });
  }

  const { data: lineageRows, error: lineageError } = await admin
    .from("teaching_versions")
    .select("brain_item_id,version_number,teaching_item_id,source_locator,created_at")
    .in("brain_item_id", itemIds);

  if (lineageError) {
    logReviewLoadError("teaching_versions", lineageError);
    return emptyPage();
  }

  const relevantLineage = (lineageRows ?? []).filter(
    (row) => latestVersionByItem.get(row.brain_item_id)?.versionNumber === row.version_number,
  );
  const teachingItemIds = Array.from(new Set(relevantLineage.map((row) => row.teaching_item_id)));

  const { data: teachingItems, error: teachingItemsError } = teachingItemIds.length
    ? await admin
        .from("teaching_items")
        .select("id,source_id,brain_item_id")
        .in("id", teachingItemIds)
    : { data: [], error: null };

  if (teachingItemsError) {
    logReviewLoadError("teaching_items", teachingItemsError);
    return emptyPage();
  }

  const sourceIdByTeachingItem = new Map(
    (teachingItems ?? []).map((item) => [item.id, item.source_id] as const),
  );
  const sourceIds = Array.from(new Set(Array.from(sourceIdByTeachingItem.values())));

  const { data: sources, error: sourcesError } = sourceIds.length
    ? await admin
        .from("teaching_sources")
        .select("id,source_type,title,source_uri,source_metadata,created_at")
        .in("id", sourceIds)
    : { data: [], error: null };

  if (sourcesError) {
    logReviewLoadError("teaching_sources", sourcesError);
    return emptyPage();
  }

  const sourceById = new Map((sources ?? []).map((source) => [source.id, source] as const));
  const sourcesByBrainItem = new Map<string, TeachingReviewSource[]>();

  for (const lineage of relevantLineage) {
    const sourceId = sourceIdByTeachingItem.get(lineage.teaching_item_id);
    if (!sourceId) continue;
    const source = sourceById.get(sourceId);
    if (!source) continue;

    const current = sourcesByBrainItem.get(lineage.brain_item_id) ?? [];
    current.push({
      id: source.id,
      type: source.source_type,
      title: source.title,
      uri: source.source_uri,
      metadata: source.source_metadata,
      locator: lineage.source_locator,
      createdAt: source.created_at,
    });
    sourcesByBrainItem.set(lineage.brain_item_id, current);
  }

  const items = pageRows.flatMap((item) => {
    const latestVersion = latestVersionByItem.get(item.id);
    if (!latestVersion) return [];

    return [
      {
        id: item.id,
        semanticLayer: item.semantic_layer,
        itemType: item.item_type,
        status: item.status as TeachingLifecycleStatus,
        priority: item.priority,
        approvedVersionNumber: item.approved_version_number,
        publishedVersionNumber: item.published_version_number,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        latestVersion,
        sources: sourcesByBrainItem.get(item.id) ?? [],
      },
    ];
  });

  return {
    items,
    status,
    page: normalizedPage,
    hasPreviousPage: normalizedPage > 1,
    hasNextPage,
    counts,
  };
}
