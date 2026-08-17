import "server-only";

import { KNOWLEDGE_LIBRARY_PAGE_SIZE, type KnowledgeSourceStatus } from "@/features/knowledge-library/core";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";
import {
  combineYouTubeImportRows,
  YOUTUBE_ACTIVE_IMPORT_LIMIT,
  YOUTUBE_FAILED_IMPORT_HISTORY_LIMIT,
} from "@/features/youtube-sources/core";

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

type YouTubeTranscriptImportRow = {
  id: string;
  video_id: string;
  canonical_url: string;
  video_title: string;
  channel_name: string | null;
  status: string;
  created_at: string;
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

function youtubeImportView(row: YouTubeTranscriptImportRow): YouTubeTranscriptImportView | null {
  if (row.status !== "processing" && row.status !== "failed") return null;
  return {
    id: row.id,
    videoId: row.video_id,
    canonicalUrl: row.canonical_url,
    videoTitle: row.video_title,
    channelName: row.channel_name,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Keeps active provider jobs visible independently from a bounded failed-import history. */
export async function loadYouTubeTranscriptImports(): Promise<YouTubeTranscriptImportView[]> {
  const admin = getKnowledgeAdminClient();
  const select = "id,video_id,canonical_url,video_title,channel_name,status,created_at";
  const [processingResult, failedResult] = await Promise.all([
    admin
      .from("youtube_transcript_imports")
      .select(select)
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(YOUTUBE_ACTIVE_IMPORT_LIMIT),
    admin
      .from("youtube_transcript_imports")
      .select(select)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(YOUTUBE_FAILED_IMPORT_HISTORY_LIMIT),
  ]);
  if (processingResult.error) {
    throw new Error(`Unable to load active YouTube transcript imports: ${processingResult.error.message}`);
  }
  if (failedResult.error) {
    throw new Error(`Unable to load failed YouTube transcript imports: ${failedResult.error.message}`);
  }

  return combineYouTubeImportRows(
    (processingResult.data ?? []) as YouTubeTranscriptImportRow[],
    (failedResult.data ?? []) as YouTubeTranscriptImportRow[],
  ).flatMap((row) => {
    const view = youtubeImportView(row);
    return view ? [view] : [];
  });
}
