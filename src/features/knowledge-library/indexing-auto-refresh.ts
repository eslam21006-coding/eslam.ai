"use server";

import { refreshKnowledgeSourceAction } from "@/features/knowledge-library/actions";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";
import { requireAdmin } from "@/lib/auth/admin";

const MAX_AUTO_REFRESH_SOURCES = 100;
const AUTO_REFRESH_CONCURRENCY = 5;

export type KnowledgeIndexAutoRefreshResult = {
  ok: boolean;
  checked: number;
  hasMore: boolean;
};

/** Reconciles globally-indexing Knowledge sources with provider state in bounded batches. */
export async function refreshKnowledgeIndexingSourcesAction(): Promise<KnowledgeIndexAutoRefreshResult> {
  await requireAdmin();
  const admin = getKnowledgeAdminClient();
  const { data, error } = await admin
    .from("knowledge_sources")
    .select("id")
    .eq("status", "indexing")
    .order("created_at", { ascending: true })
    .limit(MAX_AUTO_REFRESH_SOURCES);

  if (error) {
    console.error("Knowledge Library auto-refresh query failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, checked: 0, hasMore: true };
  }

  const rows = (data ?? []) as Array<{ id: string }>;
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

  if (countError) {
    console.error("Knowledge Library auto-refresh count failed", {
      code: countError.code,
      message: countError.message,
    });
    return { ok: true, checked: rows.length, hasMore: rows.length > 0 };
  }

  return {
    ok: true,
    checked: rows.length,
    hasMore: (count ?? 0) > 0,
  };
}
