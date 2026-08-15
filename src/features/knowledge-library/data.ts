import "server-only";

import { KNOWLEDGE_LIBRARY_PAGE_SIZE, type KnowledgeSourceStatus } from "@/features/knowledge-library/core";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";

export type KnowledgeSourceView = {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number | null;
  status: KnowledgeSourceStatus;
  createdAt: string;
  indexedAt: string | null;
};

export type KnowledgeSourcePage = {
  items: KnowledgeSourceView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type KnowledgeSourceRow = {
  id: string;
  title: string;
  original_filename: string;
  size_bytes: number | null;
  status: KnowledgeSourceStatus;
  created_at: string;
  indexed_at: string | null;
};

/** Loads one deterministic owner-scoped page and clamps stale page numbers after deletion. */
export async function loadKnowledgeSourcePage(userId: string, page: number): Promise<KnowledgeSourcePage> {
  const admin = getKnowledgeAdminClient();
  const from = (page - 1) * KNOWLEDGE_LIBRARY_PAGE_SIZE;
  const to = from + KNOWLEDGE_LIBRARY_PAGE_SIZE - 1;
  const { data, count, error } = await admin
    .from("knowledge_sources")
    .select("id,title,original_filename,size_bytes,status,created_at,indexed_at", { count: "exact" })
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) throw new Error(`Unable to load Knowledge Library sources: ${error.message}`);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / KNOWLEDGE_LIBRARY_PAGE_SIZE));

  if (total > 0 && page > totalPages) {
    return loadKnowledgeSourcePage(userId, totalPages);
  }

  return {
    items: ((data ?? []) as KnowledgeSourceRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      originalFilename: row.original_filename,
      sizeBytes: row.size_bytes,
      status: row.status,
      createdAt: row.created_at,
      indexedAt: row.indexed_at,
    })),
    page,
    pageSize: KNOWLEDGE_LIBRARY_PAGE_SIZE,
    total,
    totalPages,
  };
}
