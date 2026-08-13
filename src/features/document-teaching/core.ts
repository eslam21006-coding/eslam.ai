export const DOCUMENT_TEACHING_BUCKET = "eslam-teaching-documents";
export const DOCUMENT_TEACHING_MAX_BYTES = 50 * 1024 * 1024;
export const DOCUMENT_TEACHING_MAX_FILENAME = 255;
export const DOCUMENT_TEACHING_MAX_TITLE = 200;

export const DOCUMENT_TEACHING_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

export type DocumentTeachingMimeType = (typeof DOCUMENT_TEACHING_MIME_TYPES)[number];

export const DOCUMENT_TEACHING_ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_FILENAME_PATTERN = /[\\/\u0000-\u001f\u007f]/u;

const EXTENSION_MIME: Record<string, DocumentTeachingMimeType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

export type DocumentTeachingUploadIntent = {
  documentId: string;
  bucket: typeof DOCUMENT_TEACHING_BUCKET;
  storagePath: string;
  token: string;
  mimeType: DocumentTeachingMimeType;
  sizeBytes: number;
  originalFilename: string;
  sourceTitle: string;
};

export type DocumentTeachingUploadIntentResult =
  | { ok: true; intent: DocumentTeachingUploadIntent }
  | { ok: false; error: "invalid-document" | "create-failed" };

export type DocumentTeachingFinalizeResult =
  | { ok: true; documentId: string; sourceId: string; sizeBytes: number }
  | {
      ok: false;
      error: "invalid-request" | "not-found" | "verify-failed" | "finalize-failed";
    };

export type DocumentTeachingCancelResult =
  | { ok: true; state: "cancelled" | "uploaded" }
  | { ok: false; error: "invalid-request" | "cancel-failed" };

function extensionFromFilename(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) return null;
  return fileName.slice(lastDot + 1).toLowerCase();
}

/** Resolves a browser file into the canonical MIME type used by private Storage. */
export function resolveDocumentTeachingMimeType(
  fileName: string,
  browserMimeType: string,
): DocumentTeachingMimeType | null {
  const extension = extensionFromFilename(fileName.trim());
  if (!extension) return null;
  const canonical = EXTENSION_MIME[extension];
  if (!canonical) return null;

  const browserType = browserMimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!browserType || browserType === "application/octet-stream") return canonical;
  if (extension === "md" && (browserType === "text/plain" || browserType === "text/markdown")) {
    return canonical;
  }
  return browserType === canonical ? canonical : null;
}

/** Generates the default source label from a validated local filename. */
export function defaultDocumentTeachingTitle(fileName: string) {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  const withoutExtension = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  return withoutExtension.trim().slice(0, DOCUMENT_TEACHING_MAX_TITLE);
}

/** Validates document metadata before a signed Storage upload intent is created. */
export function validateDocumentTeachingUploadIntent(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const { fileName, mimeType, sizeBytes, title } = input as {
    fileName?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
    title?: unknown;
  };

  if (typeof fileName !== "string" || typeof mimeType !== "string" || typeof title !== "string") {
    return null;
  }

  const normalizedFileName = fileName.trim();
  const normalizedTitle = title.trim();
  if (
    !normalizedFileName ||
    normalizedFileName.length > DOCUMENT_TEACHING_MAX_FILENAME ||
    UNSAFE_FILENAME_PATTERN.test(normalizedFileName)
  ) {
    return null;
  }
  if (!normalizedTitle || normalizedTitle.length > DOCUMENT_TEACHING_MAX_TITLE) return null;
  if (
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > DOCUMENT_TEACHING_MAX_BYTES
  ) {
    return null;
  }

  const canonicalMimeType = resolveDocumentTeachingMimeType(normalizedFileName, mimeType);
  if (!canonicalMimeType) return null;
  const extension = extensionFromFilename(normalizedFileName);
  if (!extension) return null;

  return {
    fileName: normalizedFileName,
    title: normalizedTitle,
    mimeType: canonicalMimeType,
    sizeBytes,
    extension,
  };
}

/** Validates an owner-scoped document upload id submitted for finalize or cleanup. */
export function validateDocumentTeachingId(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const documentId = (input as { documentId?: unknown }).documentId;
  return typeof documentId === "string" && UUID_PATTERN.test(documentId) ? documentId : null;
}

/** Formats a stored document size for the admin workbench. */
export function formatDocumentTeachingBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
