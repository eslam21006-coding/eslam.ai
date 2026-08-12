"use server";

import { revalidatePath } from "next/cache";

import {
  DOCUMENT_TEACHING_BUCKET,
  DOCUMENT_TEACHING_MAX_BYTES,
  type DocumentTeachingCancelResult,
  type DocumentTeachingFinalizeResult,
  type DocumentTeachingUploadIntentResult,
  validateDocumentTeachingId,
  validateDocumentTeachingUploadIntent,
} from "@/features/document-teaching/core";
import { getDocumentTeachingAdminClient } from "@/features/document-teaching/database";
import { requireAdmin } from "@/lib/auth/admin";

const DOCUMENT_ADMIN_PATH = "/admin/teach/documents";
const TEACH_ADMIN_PATH = "/admin/teach";
const STALE_PENDING_UPLOAD_MS = 3 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 50;

type SupabaseAdminClient = ReturnType<typeof getDocumentTeachingAdminClient>;

type CleanupDocument = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
};

function revalidateDocumentTeachingPages() {
  revalidatePath(DOCUMENT_ADMIN_PATH);
  revalidatePath(TEACH_ADMIN_PATH);
}

function finalizedDocument(
  documentId: string,
  sourceId: string,
  sizeBytes: number,
): DocumentTeachingFinalizeResult {
  revalidateDocumentTeachingPages();
  return { ok: true, documentId, sourceId, sizeBytes };
}

async function removeClaimedDocument(
  admin: SupabaseAdminClient,
  userId: string,
  document: CleanupDocument,
): Promise<DocumentTeachingCancelResult> {
  const { error: storageError } = await admin.storage
    .from(document.storage_bucket)
    .remove([document.storage_path]);

  if (storageError) {
    console.warn("Document teaching object cleanup did not complete", {
      documentId: document.id,
      message: storageError.message,
    });
    return { ok: false, error: "cancel-failed" };
  }

  const { data: deleted, error: deleteError } = await admin
    .from("document_teaching_uploads")
    .delete()
    .eq("id", document.id)
    .eq("created_by", userId)
    .eq("status", "cancelling")
    .select("id")
    .maybeSingle();

  if (deleteError || !deleted) {
    console.error("Document teaching cancellation failed", {
      stage: "metadata-delete",
      documentId: document.id,
      code: deleteError?.code,
      message: deleteError?.message ?? "Cancellation metadata row was not deleted",
    });
    return { ok: false, error: "cancel-failed" };
  }

  revalidateDocumentTeachingPages();
  return { ok: true, state: "cancelled" };
}

async function cancelDocumentById(
  admin: SupabaseAdminClient,
  userId: string,
  documentId: string,
): Promise<DocumentTeachingCancelResult> {
  const { data: claimed, error: claimError } = await admin
    .from("document_teaching_uploads")
    .update({ status: "cancelling" })
    .eq("id", documentId)
    .eq("created_by", userId)
    .eq("status", "pending")
    .select("id,storage_bucket,storage_path,status")
    .maybeSingle();

  if (claimError) {
    console.error("Document teaching cancellation failed", {
      stage: "claim",
      documentId,
      code: claimError.code,
      message: claimError.message,
    });
    return { ok: false, error: "cancel-failed" };
  }

  let document = claimed;
  if (!document) {
    const { data: existing, error: loadError } = await admin
      .from("document_teaching_uploads")
      .select("id,storage_bucket,storage_path,status")
      .eq("id", documentId)
      .eq("created_by", userId)
      .maybeSingle();

    if (loadError) {
      console.error("Document teaching cancellation failed", {
        stage: "load",
        documentId,
        code: loadError.code,
        message: loadError.message,
      });
      return { ok: false, error: "cancel-failed" };
    }

    if (!existing) return { ok: true, state: "cancelled" };
    if (existing.status === "uploaded") return { ok: true, state: "uploaded" };
    if (existing.status !== "cancelling") return { ok: false, error: "cancel-failed" };
    document = existing;
  }

  return removeClaimedDocument(admin, userId, document);
}

/** Creates an owner-scoped pending document and a short-lived signed private Storage upload token. */
export async function createDocumentTeachingUploadAction(
  input: unknown,
): Promise<DocumentTeachingUploadIntentResult> {
  const authorization = await requireAdmin();
  const validated = validateDocumentTeachingUploadIntent(input);
  if (!validated) return { ok: false, error: "invalid-document" };

  const admin = getDocumentTeachingAdminClient();
  const documentId = crypto.randomUUID();
  const storagePath = `${authorization.userId}/${documentId}.${validated.extension}`;

  const { error: insertError } = await admin.from("document_teaching_uploads").insert({
    id: documentId,
    created_by: authorization.userId,
    storage_bucket: DOCUMENT_TEACHING_BUCKET,
    storage_path: storagePath,
    status: "pending",
    source_title: validated.title,
    original_filename: validated.fileName,
    mime_type: validated.mimeType,
    declared_size_bytes: validated.sizeBytes,
  });

  if (insertError) {
    console.error("Document teaching upload intent creation failed", {
      stage: "metadata",
      code: insertError.code,
      message: insertError.message,
    });
    return { ok: false, error: "create-failed" };
  }

  const { data: signedUpload, error: signedUploadError } = await admin.storage
    .from(DOCUMENT_TEACHING_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedUploadError || !signedUpload?.token) {
    console.error("Document teaching upload intent creation failed", {
      stage: "signed-upload",
      message: signedUploadError?.message ?? "Signed upload token missing",
    });

    await admin
      .from("document_teaching_uploads")
      .delete()
      .eq("id", documentId)
      .eq("created_by", authorization.userId)
      .eq("status", "pending");

    return { ok: false, error: "create-failed" };
  }

  return {
    ok: true,
    intent: {
      documentId,
      bucket: DOCUMENT_TEACHING_BUCKET,
      storagePath,
      token: signedUpload.token,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      originalFilename: validated.fileName,
      sourceTitle: validated.title,
    },
  };
}

/** Verifies the private Storage object and atomically registers its immutable document teaching source. */
export async function finalizeDocumentTeachingUploadAction(
  input: unknown,
): Promise<DocumentTeachingFinalizeResult> {
  const authorization = await requireAdmin();
  const documentId = validateDocumentTeachingId(input);
  if (!documentId) return { ok: false, error: "invalid-request" };

  const admin = getDocumentTeachingAdminClient();
  const { data: document, error: documentError } = await admin
    .from("document_teaching_uploads")
    .select(
      "id,storage_bucket,storage_path,status,mime_type,declared_size_bytes,size_bytes,source_id",
    )
    .eq("id", documentId)
    .eq("created_by", authorization.userId)
    .maybeSingle();

  if (documentError) {
    console.error("Document teaching finalization failed", {
      stage: "load",
      code: documentError.code,
      message: documentError.message,
    });
    return { ok: false, error: "finalize-failed" };
  }

  if (!document) return { ok: false, error: "not-found" };
  if (document.status === "uploaded" && document.source_id && document.size_bytes) {
    return finalizedDocument(document.id, document.source_id, document.size_bytes);
  }
  if (document.status !== "pending") return { ok: false, error: "not-found" };

  const { data: storedObject, error: infoError } = await admin.storage
    .from(document.storage_bucket)
    .info(document.storage_path);

  if (infoError || !storedObject) {
    console.error("Document teaching finalization failed", {
      stage: "storage-info",
      message: infoError?.message ?? "Storage object missing",
    });
    return { ok: false, error: "verify-failed" };
  }

  const sizeBytes = Number(storedObject.size);
  const storedContentType = storedObject.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > DOCUMENT_TEACHING_MAX_BYTES ||
    sizeBytes !== document.declared_size_bytes ||
    storedContentType !== document.mime_type
  ) {
    console.error("Document teaching finalization failed", {
      stage: "storage-validation",
      documentId,
      sizeBytes,
      declaredSizeBytes: document.declared_size_bytes,
      storedContentType,
      expectedContentType: document.mime_type,
    });
    return { ok: false, error: "verify-failed" };
  }

  const { data: sourceId, error: finalizeError } = await admin.rpc(
    "finalize_document_teaching_upload",
    {
      p_document_id: document.id,
      p_created_by: authorization.userId,
      p_size_bytes: sizeBytes,
    },
  );

  if (finalizeError || !sourceId) {
    console.error("Document teaching finalization failed", {
      stage: "atomic-finalize",
      documentId,
      code: finalizeError?.code,
      message: finalizeError?.message ?? "Finalize RPC returned no source id",
    });
    return { ok: false, error: "finalize-failed" };
  }

  return finalizedDocument(document.id, sourceId, sizeBytes);
}

/** Claims and removes an unfinished owner-scoped upload without touching immutable uploaded sources. */
export async function cancelDocumentTeachingUploadAction(
  input: unknown,
): Promise<DocumentTeachingCancelResult> {
  const authorization = await requireAdmin();
  const documentId = validateDocumentTeachingId(input);
  if (!documentId) return { ok: false, error: "invalid-request" };

  return cancelDocumentById(
    getDocumentTeachingAdminClient(),
    authorization.userId,
    documentId,
  );
}

/** Reclaims stale pending document intents and retries durable cleanup rows for the current admin. */
export async function retryQueuedDocumentTeachingCleanupsAction() {
  const authorization = await requireAdmin();
  const admin = getDocumentTeachingAdminClient();
  const { data: cancelling, error: cancellingError } = await admin
    .from("document_teaching_uploads")
    .select("id")
    .eq("created_by", authorization.userId)
    .eq("status", "cancelling")
    .order("created_at", { ascending: true })
    .limit(CLEANUP_BATCH_SIZE);

  if (cancellingError) {
    console.error("Document teaching cleanup queue load failed", {
      stage: "cancelling",
      code: cancellingError.code,
      message: cancellingError.message,
    });
    return { ok: false as const, cleaned: 0, failed: 0 };
  }

  const queuedIds = (cancelling ?? []).map((document) => document.id);
  const remaining = CLEANUP_BATCH_SIZE - queuedIds.length;
  if (remaining > 0) {
    const staleCutoff = new Date(Date.now() - STALE_PENDING_UPLOAD_MS).toISOString();
    const { data: stalePending, error: staleError } = await admin
      .from("document_teaching_uploads")
      .select("id")
      .eq("created_by", authorization.userId)
      .eq("status", "pending")
      .lt("created_at", staleCutoff)
      .order("created_at", { ascending: true })
      .limit(remaining);

    if (staleError) {
      console.error("Document teaching cleanup queue load failed", {
        stage: "stale-pending",
        code: staleError.code,
        message: staleError.message,
      });
      return { ok: false as const, cleaned: 0, failed: 0 };
    }

    queuedIds.push(...(stalePending ?? []).map((document) => document.id));
  }

  let cleaned = 0;
  let failed = 0;
  for (const documentId of queuedIds) {
    const result = await cancelDocumentById(admin, authorization.userId, documentId);
    if (result.ok) cleaned += 1;
    else failed += 1;
  }

  return failed > 0
    ? { ok: false as const, cleaned, failed }
    : { ok: true as const, cleaned, failed: 0 };
}
