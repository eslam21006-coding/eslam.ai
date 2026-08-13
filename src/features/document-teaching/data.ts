import "server-only";

import { getDocumentTeachingAdminClient } from "@/features/document-teaching/database";

export const DOCUMENT_TEACHING_PAGE_SIZE = 20;

export type DocumentTeachingListItem = {
  documentId: string;
  sourceId: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type DocumentTeachingPage = {
  items: DocumentTeachingListItem[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/** Loads one deterministic page of immutable uploaded document teaching sources for the current admin. */
export async function loadDocumentTeachingPage(
  userId: string,
  page = 1,
): Promise<DocumentTeachingPage> {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * DOCUMENT_TEACHING_PAGE_SIZE;
  const admin = getDocumentTeachingAdminClient();
  const { data, error } = await admin
    .from("document_teaching_uploads")
    .select("id,source_id,source_title,original_filename,mime_type,size_bytes,uploaded_at")
    .eq("created_by", userId)
    .eq("status", "uploaded")
    .order("uploaded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + DOCUMENT_TEACHING_PAGE_SIZE);

  if (error) {
    throw new Error(`Unable to load document teaching sources: ${error.code}`);
  }

  const hasNext = (data?.length ?? 0) > DOCUMENT_TEACHING_PAGE_SIZE;
  const rows = (data ?? []).slice(0, DOCUMENT_TEACHING_PAGE_SIZE);
  const items = rows.flatMap((row): DocumentTeachingListItem[] => {
    if (!row.source_id || !row.size_bytes || !row.uploaded_at) return [];
    return [
      {
        documentId: row.id,
        sourceId: row.source_id,
        title: row.source_title,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        uploadedAt: row.uploaded_at,
      },
    ];
  });

  return {
    items,
    page: safePage,
    hasPrevious: safePage > 1,
    hasNext,
  };
}
