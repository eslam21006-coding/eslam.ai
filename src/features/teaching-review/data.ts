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

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;
type LineageRow = {
  id: string;
  brain_item_id: string;
  version_number: number;
  teaching_item_id: string;
  source_locator: Json;
  created_at: string;
};

const LINEAGE_BATCH_SIZE = 500;
const ID_QUERY_CHUNK_SIZE = 200;

/** Records bounded review-data load failures without leaking privileged query details to the client. */
function logReviewLoadError(stage: string, error: { code?: string; message?: string } | null) {
  console.error("Teaching review load failed", {
    stage,
    code: error?.code,
    message: error?.message ?? "Unknown teaching review load error",
  });
}

/** Returns a complete zeroed lifecycle-count object for fail-closed review rendering. */
function emptyCounts(): Record<TeachingLifecycleStatus, number> {
  return { draft: 0, approved: 0, published: 0, archived: 0 };
}

/** Splits identifier lists into bounded PostgREST query batches. */
function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/** Loads owner-scoped counts for each persisted teaching lifecycle state. */
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

/** Loads exactly one latest immutable Brain version per rendered item. */
async function loadLatestVersions(admin: AdminClient, itemIds: string[]) {
  const results = await Promise.all(
    itemIds.map(async (itemId) => {
      const { data, error } = await admin
        .from("eslam_brain_versions")
        .select("item_id,version_number,title,content,summary,topics,change_note,created_at")
        .eq("item_id", itemId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      return { itemId, data, error };
    }),
  );

  const latestVersionByItem = new Map<string, TeachingReviewVersion>();
  let failed = false;

  for (const result of results) {
    if (result.error) {
      logReviewLoadError(`latest-version:${result.itemId}`, result.error);
      failed = true;
      continue;
    }
    if (!result.data) continue;
    latestVersionByItem.set(result.itemId, {
      versionNumber: result.data.version_number,
      title: result.data.title,
      content: result.data.content,
      summary: result.data.summary,
      topics: result.data.topics,
      changeNote: result.data.change_note,
      createdAt: result.data.created_at,
    });
  }

  return { latestVersionByItem, failed };
}

/** Paginates every provenance link attached to one exact immutable Brain version. */
async function loadExactVersionLineage(
  admin: AdminClient,
  brainItemId: string,
  versionNumber: number,
): Promise<{ rows: LineageRow[]; failed: boolean }> {
  const rows: LineageRow[] = [];

  for (let from = 0; ; from += LINEAGE_BATCH_SIZE) {
    const { data, error } = await admin
      .from("teaching_versions")
      .select("id,brain_item_id,version_number,teaching_item_id,source_locator,created_at")
      .eq("brain_item_id", brainItemId)
      .eq("version_number", versionNumber)
      .order("teaching_item_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + LINEAGE_BATCH_SIZE - 1);

    if (error) {
      logReviewLoadError(`lineage:${brainItemId}:v${versionNumber}`, error);
      return { rows: [], failed: true };
    }

    const batch = (data ?? []) as LineageRow[];
    rows.push(...batch);
    if (batch.length < LINEAGE_BATCH_SIZE) break;
  }

  return { rows, failed: false };
}

/** Loads one owner-scoped review page with latest content, lifecycle counts, and complete latest-version provenance. */
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

  const { latestVersionByItem, failed: versionsFailed } = await loadLatestVersions(admin, itemIds);
  if (versionsFailed) return emptyPage();

  const lineageResults = await Promise.all(
    itemIds.map(async (itemId) => {
      const latestVersion = latestVersionByItem.get(itemId);
      if (!latestVersion) return { rows: [] as LineageRow[], failed: false };
      return loadExactVersionLineage(admin, itemId, latestVersion.versionNumber);
    }),
  );

  if (lineageResults.some((result) => result.failed)) return emptyPage();
  const relevantLineage = lineageResults.flatMap((result) => result.rows);
  const teachingItemIds = Array.from(new Set(relevantLineage.map((row) => row.teaching_item_id)));

  const teachingItemResults = teachingItemIds.length
    ? await Promise.all(
        chunks(teachingItemIds, ID_QUERY_CHUNK_SIZE).map((ids) =>
          admin.from("teaching_items").select("id,source_id,brain_item_id").in("id", ids).limit(ids.length),
        ),
      )
    : [];

  if (teachingItemResults.some((result) => result.error)) {
    const failure = teachingItemResults.find((result) => result.error);
    logReviewLoadError("teaching_items", failure?.error ?? null);
    return emptyPage();
  }

  const teachingItems = teachingItemResults.flatMap((result) => result.data ?? []);
  const sourceIdByTeachingItem = new Map(
    teachingItems.map((item) => [item.id, item.source_id] as const),
  );
  const sourceIds = Array.from(new Set(Array.from(sourceIdByTeachingItem.values())));

  const sourceResults = sourceIds.length
    ? await Promise.all(
        chunks(sourceIds, ID_QUERY_CHUNK_SIZE).map((ids) =>
          admin
            .from("teaching_sources")
            .select("id,source_type,title,source_uri,source_metadata,created_at")
            .in("id", ids)
            .limit(ids.length),
        ),
      )
    : [];

  if (sourceResults.some((result) => result.error)) {
    const failure = sourceResults.find((result) => result.error);
    logReviewLoadError("teaching_sources", failure?.error ?? null);
    return emptyPage();
  }

  const sources = sourceResults.flatMap((result) => result.data ?? []);
  const sourceById = new Map(sources.map((source) => [source.id, source] as const));
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
