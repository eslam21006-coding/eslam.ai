export const KNOWLEDGE_LIBRARY_BUCKET = "eslam-knowledge-documents";
export const KNOWLEDGE_LIBRARY_MAX_BYTES = 50 * 1024 * 1024;
export const KNOWLEDGE_LIBRARY_MAX_FILENAME = 255;
export const KNOWLEDGE_LIBRARY_MAX_TITLE = 200;
export const KNOWLEDGE_LIBRARY_PAGE_SIZE = 20;
export const KNOWLEDGE_LIBRARY_VECTOR_STORE_NAME = "Eslam.AI Knowledge Library";

export const KNOWLEDGE_LIBRARY_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
] as const;

export type KnowledgeLibraryMimeType = (typeof KNOWLEDGE_LIBRARY_MIME_TYPES)[number];
export type KnowledgeSourceStatus = "pending" | "indexing" | "ready" | "failed" | "deleting";

export const KNOWLEDGE_LIBRARY_ACCEPT =
  ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_FILENAME_PATTERN = /[\\/\u0000-\u001f\u007f]/u;

const EXTENSION_MIME: Record<string, KnowledgeLibraryMimeType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

export type KnowledgeUploadIntent = {
  sourceId: string;
  bucket: typeof KNOWLEDGE_LIBRARY_BUCKET;
  storagePath: string;
  token: string;
  mimeType: KnowledgeLibraryMimeType;
  sizeBytes: number;
  originalFilename: string;
  title: string;
};

export type KnowledgeUploadIntentResult =
  | { ok: true; intent: KnowledgeUploadIntent }
  | { ok: false; error: "invalid-document" | "create-failed" };

export type KnowledgeFinalizeResult =
  | { ok: true; sourceId: string; status: "indexing" | "ready" }
  | {
      ok: false;
      error: "invalid-request" | "not-found" | "verify-failed" | "index-failed";
    };

export type KnowledgeMutationResult =
  | { ok: true; status?: KnowledgeSourceStatus }
  | { ok: false; error: "invalid-request" | "not-found" | "operation-failed" };

function extensionFromFilename(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) return null;
  return fileName.slice(lastDot + 1).toLowerCase();
}

/** Resolves a selected knowledge file into the canonical MIME stored privately. */
export function resolveKnowledgeMimeType(
  fileName: string,
  browserMimeType: string,
): KnowledgeLibraryMimeType | null {
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

/** Derives a concise default library title from a local filename. */
export function defaultKnowledgeTitle(fileName: string) {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  const withoutExtension = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  return withoutExtension.trim().slice(0, KNOWLEDGE_LIBRARY_MAX_TITLE);
}

/** Validates metadata before a signed private Knowledge Library upload is created. */
export function validateKnowledgeUploadIntent(input: unknown) {
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
    normalizedFileName.length > KNOWLEDGE_LIBRARY_MAX_FILENAME ||
    UNSAFE_FILENAME_PATTERN.test(normalizedFileName)
  ) {
    return null;
  }
  if (!normalizedTitle || normalizedTitle.length > KNOWLEDGE_LIBRARY_MAX_TITLE) return null;
  if (
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > KNOWLEDGE_LIBRARY_MAX_BYTES
  ) {
    return null;
  }

  const canonicalMimeType = resolveKnowledgeMimeType(normalizedFileName, mimeType);
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

/** Validates an owner-scoped knowledge source id submitted by the admin UI. */
export function validateKnowledgeSourceId(input: unknown) {
  const sourceId =
    typeof input === "string"
      ? input
      : input && typeof input === "object"
        ? (input as { sourceId?: unknown }).sourceId
        : null;
  return typeof sourceId === "string" && UUID_PATTERN.test(sourceId) ? sourceId : null;
}

/** Formats stored Knowledge Library bytes for admin-facing source metadata. */
export function formatKnowledgeBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
