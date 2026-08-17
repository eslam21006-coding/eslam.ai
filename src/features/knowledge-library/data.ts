import "server-only";

import { KNOWLEDGE_LIBRARY_PAGE_SIZE, type KnowledgeSourceStatus } from "@/features/knowledge-library/core";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";

export type KnowledgeSourceKind = "document" | "youtube_transcript";
export type KnowledgeSourceView = {
  id: string;
  title: string;
  originalFilename: string;
  sizeBytes: number | null;
  status: KnowledgeSourceStatus;
  sourceKind: KnowledgeSourceKind;
  sourceUrl: string | null;
  sourceLanguage: string | null;
  createdAt: string;
  indexedAt: string | null;
};

export type KnowledgeSourcePage = {
  items: KnowledgeSourceView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasIndexing: boolean;
};

export type YouTubeTranscriptImportView = {
  id: string;
  videoId: string;
  canonicalUrl: string;
  videoTitle: string;
  channelName: string | null;
  status: "processing" | "failed";
  createdAt: string;
};

type KnowledgeSourceRow = {
  id: string;
  title: string;
  original_filename: string;
  size_bytes: number | null;
  status: KnowledgeSourceStatus;
  source_kind: string;
  source_url: string | null;
  source_language: string | null;
  created_at: string;
  indexed_at: string | null;
};

/** Loads one deterministic global Admin page and clamps stale page numbers after deletion. */
export async function loadKnowledgeSourcePage(page: number): Promise<KnowledgeSourcePage> {
  const admin = getKnowledgeAdminClient();
  const from = (page - 1) * KNOWLEDGE_LIBRARY_PAGE_SIZE;
  const to = from + KNOWLEDGE_LIBRARY_PAGE_SIZE - 1;
  const [{ data, count, error }, { count: indexingCount, error: indexingError }] = await Promise.all([
    admin
      .from("knowledge_sources")
      .select("id,title,original_filename,size_bytes,status,source_kind,source_url,source_language,created_at,indexed_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
    admin
      .from("knowledge_sources")
      .select("id", { count: "exact", head: true })
      .eq("status", "indexing"),
  ]);

  if (error) throw new Error(`Unable to load Knowledge Library sources: ${error.message}`);
  if (indexingError) {
    throw new Error(`Unable to load Knowledge Library indexing state: ${indexingError.message}`);
  }
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / KNOWLEDGE_LIBRARY_PAGE_SIZE));

  if (total > 0 && page > totalPages) {
    return loadKnowledgeSourcePage(totalPages);
  }

  return {
    items: ((data ?? []) as KnowledgeSourceRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      originalFilename: row.original_filename,
      sizeBytes: row.size_bytes,
      status: row.status,
      sourceKind: row.source_kind === "youtube_transcript" ? "youtube_transcript" : "document",
      sourceUrl: row.source_url,
      sourceLanguage: row.source_language,
      createdAt: row.created_at,
      indexedAt: row.indexed_at,
    })),
    page,
    pageSize: KNOWLEDGE_LIBRARY_PAGE_SIZE,
    total,
    totalPages,
    hasIndexing: (indexingCount ?? 0) > 0,
  };
}

/** Loads bounded service-only YouTube provider jobs that have not materialized into Knowledge yet. */
export async function loadYouTubeTranscriptImports(): Promise<YouTubeTranscriptImportView[]> {
  const admin = getKnowledgeAdminClient();
  const { data, error } = await admin
    .from("youtube_transcript_imports")
    .select("id,video_id,canonical_url,video_title,channel_name,status,created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(12);
  if (error) throw new Error(`Unable to load YouTube transcript imports: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    if (row.status !== "processing" && row.status !== "failed") return [];
    return [{
      id: row.id,
      videoId: row.video_id,
      canonicalUrl: row.canonical_url,
      videoTitle: row.video_title,
      channelName: row.channel_name,
      status: row.status,
      createdAt: row.created_at,
    } satisfies YouTubeTranscriptImportView];
  });
}
