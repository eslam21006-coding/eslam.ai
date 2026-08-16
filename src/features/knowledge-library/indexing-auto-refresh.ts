"use server";

import { refreshKnowledgeSourceAction } from "@/features/knowledge-library/actions";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";
import { requireAdmin } from "@/lib/auth/admin";

const MAX_AUTO_REFRESH_SOURCES = 100;
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

async function loadIndexingBatch(
  admin: ReturnType<typeof getKnowledgeAdminClient>,
  afterId: string | null,
) {
  const query = () =>
    admin
      .from("knowledge_sources")
      .select("id")
      .eq("status", "indexing")
      .order("id", { ascending: true })
      .limit(MAX_AUTO_REFRESH_SOURCES);

  const first = afterId ? await query().gt("id", afterId) : await query();
  if (first.error) return first;
  if ((first.data?.length ?? 0) > 0 || !afterId) return first;

  // We reached the end of the UUID keyspace while indexing work still exists.
  // Wrap to the beginning so repeated polls rotate through every bounded batch.
  return query();
}

/** Reconciles globally-indexing Knowledge sources with provider state in rotating bounded batches. */
export async function refreshKnowledgeIndexingSourcesAction(
  input: KnowledgeIndexAutoRefreshInput = {},
): Promise<KnowledgeIndexAutoRefreshResult> {
  await requireAdmin();
  const admin = getKnowledgeAdminClient();
  const afterId = validCursor(input.afterId) ? input.afterId : null;
  const { data, error } = await loadIndexingBatch(admin, afterId);

  if (error) {
    console.error("Knowledge Library auto-refresh query failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, checked: 0, hasMore: true, nextCursor: afterId };
  }

  const rows = (data ?? []) as IndexingRow[];
  for (let index = 0; index < rows.length; index += AUTO_REFRESH_CONCURRENCY) {
    const batch = rows.slice(index, index + AUTO_REFRESH_CONCURRENCY);
    await Promise.allSettled(
      batch.map((row) => refreshKnowledgeSourceAction({ sourceId: row.id })),
    );
  }

  const { count, error: countError } = await admin
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "indexing");
  const nextCursor = rows.at(-1)?.id ?? null;

  if (countError) {
    console.error("Knowledge Library auto-refresh count failed", {
      code: countError.code,
      message: countError.message,
    });
    return {
      ok: true,
      checked: rows.length,
      hasMore: rows.length > 0,
      nextCursor,
    };
  }

  return {
    ok: true,
    checked: rows.length,
    hasMore: (count ?? 0) > 0,
    nextCursor: (count ?? 0) > 0 ? nextCursor : null,
  };
}
