"use server";

import { refreshKnowledgeSourceAction } from "@/features/knowledge-library/actions";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";
import { requireAdmin } from "@/lib/auth/admin";

const MAX_PROVIDER_STATUS_REFRESH_SOURCES = 10;
const MAX_EXPIRED_RECLAIMS = 1;
const AUTO_REFRESH_CONCURRENCY = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type KnowledgeIndexAutoRefreshResult = {
  ok: boolean;
  checked: number;
  hasMore: boolean;
  nextCursor: string | null;
};

type KnowledgeIndexAutoRefreshInput = {
  afterId?: string | null;
};

type IndexingRow = { id: string };

function validCursor(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

async function loadProviderIndexingBatch(
  admin: ReturnType<typeof getKnowledgeAdminClient>,
  afterId: string | null,
) {
  const query = () =>
    admin
      .from("knowledge_sources")
      .select("id")
      .eq("status", "indexing")
      .is("index_claim_token", null)
      .not("openai_file_id", "is", null)
      .not("vector_store_id", "is", null)
      .order("id", { ascending: true })
      .limit(MAX_PROVIDER_STATUS_REFRESH_SOURCES);

  const first = afterId ? await query().gt("id", afterId) : await query();
  if (first.error) return first;
  if ((first.data?.length ?? 0) > 0 || !afterId) return first;

  // We reached the end of the UUID keyspace while provider-indexing work can still exist.
  // Wrap to the beginning so repeated polls rotate through every bounded batch.
  return query();
}

async function loadExpiredReclaims(admin: ReturnType<typeof getKnowledgeAdminClient>) {
  return admin
    .from("knowledge_sources")
    .select("id")
    .eq("status", "indexing")
    .not("index_claim_token", "is", null)
    .lte("index_lease_expires_at", new Date().toISOString())
    .order("index_lease_expires_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_EXPIRED_RECLAIMS);
}

async function refreshProviderRows(rows: IndexingRow[]) {
  for (let index = 0; index < rows.length; index += AUTO_REFRESH_CONCURRENCY) {
    const batch = rows.slice(index, index + AUTO_REFRESH_CONCURRENCY);
    await Promise.allSettled(
      batch.map((row) => refreshKnowledgeSourceAction({ sourceId: row.id })),
    );
  }
}

/** Reconciles provider state broadly while allowing only one expensive expired-lease re-index per poll. */
export async function refreshKnowledgeIndexingSourcesAction(
  input: KnowledgeIndexAutoRefreshInput = {},
): Promise<KnowledgeIndexAutoRefreshResult> {
  await requireAdmin();
  const admin = getKnowledgeAdminClient();
  const afterId = validCursor(input.afterId) ? input.afterId : null;

  const [providerResult, reclaimResult] = await Promise.all([
    loadProviderIndexingBatch(admin, afterId),
    loadExpiredReclaims(admin),
  ]);

  if (providerResult.error || reclaimResult.error) {
    const error = providerResult.error ?? reclaimResult.error;
    console.error("Knowledge Library auto-refresh query failed", {
      code: error?.code,
      message: error?.message,
    });
    return { ok: false, checked: 0, hasMore: true, nextCursor: afterId };
  }

  const providerRows = (providerResult.data ?? []) as IndexingRow[];
  const reclaimRows = (reclaimResult.data ?? []) as IndexingRow[];

  // Run the single potentially-expensive reclaim concurrently with bounded provider GETs.
  // With current provider request deadlines this keeps one poll below the page-level 300s budget.
  await Promise.all([
    refreshProviderRows(providerRows),
    Promise.allSettled(
      reclaimRows.map((row) => refreshKnowledgeSourceAction({ sourceId: row.id })),
    ),
  ]);

  const { count, error: countError } = await admin
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "indexing");
  const nextCursor = providerRows.at(-1)?.id ?? null;
  const checked = providerRows.length + reclaimRows.length;

  if (countError) {
    console.error("Knowledge Library auto-refresh count failed", {
      code: countError.code,
      message: countError.message,
    });
    return {
      ok: true,
      checked,
      hasMore: checked > 0,
      nextCursor,
    };
  }

  return {
    ok: true,
    checked,
    hasMore: (count ?? 0) > 0,
    nextCursor: (count ?? 0) > 0 ? nextCursor : null,
  };
}
