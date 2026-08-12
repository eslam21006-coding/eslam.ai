"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  VOICE_RECORDING_BUCKET,
  VOICE_RECORDING_MAX_BYTES,
  type VoiceCancelResult,
  type VoiceFinalizeResult,
  type VoiceUploadIntentResult,
  validateVoiceFinalizeInput,
  validateVoiceRecordingId,
  validateVoiceUploadIntentInput,
  voiceRecordingExtension,
} from "@/features/voice-recorder/core";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

type CleanupRecording = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
};

const STALE_PENDING_UPLOAD_MS = 3 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 50;
const VOICE_ADMIN_PATH = "/admin/teach/voice";

function finalizedVoiceRecording(recordingId: string, sizeBytes: number): VoiceFinalizeResult {
  revalidatePath(VOICE_ADMIN_PATH);
  return { ok: true, recordingId, sizeBytes };
}

async function removeClaimedVoiceRecording(
  admin: SupabaseAdminClient,
  userId: string,
  recording: CleanupRecording,
): Promise<VoiceCancelResult> {
  const { error: storageError } = await admin.storage
    .from(recording.storage_bucket)
    .remove([recording.storage_path]);

  if (storageError) {
    console.warn("Voice recording object cleanup did not complete", {
      recordingId: recording.id,
      message: storageError.message,
    });
    return { ok: false, error: "cancel-failed" };
  }

  const { data: deleted, error: deleteError } = await admin
    .from("voice_recordings")
    .delete()
    .eq("id", recording.id)
    .eq("created_by", userId)
    .eq("status", "cancelling")
    .select("id")
    .maybeSingle();

  if (deleteError || !deleted) {
    console.error("Voice recording cancellation failed", {
      stage: "metadata-delete",
      recordingId: recording.id,
      code: deleteError?.code,
      message: deleteError?.message ?? "Cancellation metadata row was not deleted",
    });
    return { ok: false, error: "cancel-failed" };
  }

  return { ok: true };
}

async function cancelVoiceRecordingById(
  admin: SupabaseAdminClient,
  userId: string,
  recordingId: string,
): Promise<VoiceCancelResult> {
  const { data: claimed, error: claimError } = await admin
    .from("voice_recordings")
    .update({ status: "cancelling" })
    .eq("id", recordingId)
    .eq("created_by", userId)
    .eq("status", "pending")
    .select("id,storage_bucket,storage_path,status")
    .maybeSingle();

  if (claimError) {
    console.error("Voice recording cancellation failed", {
      stage: "claim",
      recordingId,
      code: claimError.code,
      message: claimError.message,
    });
    return { ok: false, error: "cancel-failed" };
  }

  let recording = claimed;
  if (!recording) {
    const { data: existing, error: loadError } = await admin
      .from("voice_recordings")
      .select("id,storage_bucket,storage_path,status")
      .eq("id", recordingId)
      .eq("created_by", userId)
      .maybeSingle();

    if (loadError) {
      console.error("Voice recording cancellation failed", {
        stage: "load",
        recordingId,
        code: loadError.code,
        message: loadError.message,
      });
      return { ok: false, error: "cancel-failed" };
    }

    if (!existing || existing.status === "uploaded") return { ok: true };
    if (existing.status !== "cancelling") return { ok: false, error: "cancel-failed" };
    recording = existing;
  }

  return removeClaimedVoiceRecording(admin, userId, recording);
}

/** Creates an owner-scoped pending recording and a short-lived signed Storage upload token. */
export async function createVoiceRecordingUploadAction(
  input: unknown,
): Promise<VoiceUploadIntentResult> {
  const authorization = await requireAdmin();
  const validated = validateVoiceUploadIntentInput(input);
  if (!validated) return { ok: false, error: "invalid-audio" };

  const admin = getSupabaseAdminClient();
  const recordingId = crypto.randomUUID();
  const extension = voiceRecordingExtension(validated.mimeType);
  const storagePath = `${authorization.userId}/${recordingId}.${extension}`;

  const { error: insertError } = await admin.from("voice_recordings").insert({
    id: recordingId,
    created_by: authorization.userId,
    storage_bucket: VOICE_RECORDING_BUCKET,
    storage_path: storagePath,
    status: "pending",
    mime_type: validated.mimeType,
  });

  if (insertError) {
    console.error("Voice recording intent creation failed", {
      stage: "metadata",
      code: insertError.code,
      message: insertError.message,
    });
    return { ok: false, error: "create-failed" };
  }

  const { data: signedUpload, error: signedUploadError } = await admin.storage
    .from(VOICE_RECORDING_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedUploadError || !signedUpload?.token) {
    console.error("Voice recording intent creation failed", {
      stage: "signed-upload",
      message: signedUploadError?.message ?? "Signed upload token missing",
    });

    await admin
      .from("voice_recordings")
      .delete()
      .eq("id", recordingId)
      .eq("created_by", authorization.userId)
      .eq("status", "pending");

    return { ok: false, error: "create-failed" };
  }

  return {
    ok: true,
    intent: {
      recordingId,
      bucket: VOICE_RECORDING_BUCKET,
      storagePath,
      token: signedUpload.token,
      mimeType: validated.mimeType,
    },
  };
}

/** Verifies the private Storage object and atomically marks its owner-scoped metadata uploaded. */
export async function finalizeVoiceRecordingUploadAction(
  input: unknown,
): Promise<VoiceFinalizeResult> {
  const authorization = await requireAdmin();
  const validated = validateVoiceFinalizeInput(input);
  if (!validated) return { ok: false, error: "invalid-request" };

  const admin = getSupabaseAdminClient();
  const { data: recording, error: recordingError } = await admin
    .from("voice_recordings")
    .select("id,storage_bucket,storage_path,status,mime_type,size_bytes")
    .eq("id", validated.recordingId)
    .eq("created_by", authorization.userId)
    .maybeSingle();

  if (recordingError) {
    console.error("Voice recording finalization failed", {
      stage: "load",
      code: recordingError.code,
      message: recordingError.message,
    });
    return { ok: false, error: "finalize-failed" };
  }

  if (!recording) return { ok: false, error: "not-found" };
  if (recording.status === "uploaded" && recording.size_bytes) {
    return finalizedVoiceRecording(recording.id, recording.size_bytes);
  }
  if (recording.status !== "pending") return { ok: false, error: "not-found" };

  const { data: storedObject, error: infoError } = await admin.storage
    .from(recording.storage_bucket)
    .info(recording.storage_path);

  if (infoError || !storedObject) {
    console.error("Voice recording finalization failed", {
      stage: "storage-info",
      message: infoError?.message ?? "Storage object missing",
    });
    return { ok: false, error: "verify-failed" };
  }

  const sizeBytes = Number(storedObject.size);
  const storedContentType = storedObject.contentType?.split(";", 1)[0]?.toLowerCase();
  if (
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > VOICE_RECORDING_MAX_BYTES ||
    storedContentType !== recording.mime_type
  ) {
    console.error("Voice recording finalization failed", {
      stage: "storage-validation",
      sizeBytes,
      storedContentType,
    });
    return { ok: false, error: "verify-failed" };
  }

  const { data: finalized, error: finalizeError } = await admin
    .from("voice_recordings")
    .update({
      status: "uploaded",
      size_bytes: sizeBytes,
      duration_ms: validated.durationMs,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", recording.id)
    .eq("created_by", authorization.userId)
    .eq("status", "pending")
    .select("id,size_bytes")
    .maybeSingle();

  if (finalizeError) {
    console.error("Voice recording finalization failed", {
      stage: "metadata-update",
      code: finalizeError.code,
      message: finalizeError.message,
    });
    return { ok: false, error: "finalize-failed" };
  }

  if (finalized?.size_bytes) {
    return finalizedVoiceRecording(finalized.id, finalized.size_bytes);
  }

  const { data: concurrent } = await admin
    .from("voice_recordings")
    .select("id,status,size_bytes")
    .eq("id", recording.id)
    .eq("created_by", authorization.userId)
    .maybeSingle();

  if (concurrent?.status === "uploaded" && concurrent.size_bytes) {
    return finalizedVoiceRecording(concurrent.id, concurrent.size_bytes);
  }

  return { ok: false, error: "finalize-failed" };
}

/** Claims pending cleanup atomically so cancellation cannot delete a concurrently finalized object. */
export async function cancelVoiceRecordingUploadAction(
  input: unknown,
): Promise<VoiceCancelResult> {
  const authorization = await requireAdmin();
  const recordingId = validateVoiceRecordingId(input);
  if (!recordingId) return { ok: false, error: "invalid-request" };

  return cancelVoiceRecordingById(
    getSupabaseAdminClient(),
    authorization.userId,
    recordingId,
  );
}

/** Retries durable cleanup rows and reclaims expired pending upload intents for the current admin. */
export async function retryQueuedVoiceRecordingCleanupsAction() {
  const authorization = await requireAdmin();
  const admin = getSupabaseAdminClient();
  const { data: cancelling, error: cancellingError } = await admin
    .from("voice_recordings")
    .select("id")
    .eq("created_by", authorization.userId)
    .eq("status", "cancelling")
    .order("created_at", { ascending: true })
    .limit(CLEANUP_BATCH_SIZE);

  if (cancellingError) {
    console.error("Voice recording cleanup queue load failed", {
      stage: "cancelling",
      code: cancellingError.code,
      message: cancellingError.message,
    });
    return { ok: false as const, cleaned: 0, failed: 0 };
  }

  const queuedIds = (cancelling ?? []).map((recording) => recording.id);
  const remaining = CLEANUP_BATCH_SIZE - queuedIds.length;

  if (remaining > 0) {
    const staleCutoff = new Date(Date.now() - STALE_PENDING_UPLOAD_MS).toISOString();
    const { data: stalePending, error: stalePendingError } = await admin
      .from("voice_recordings")
      .select("id")
      .eq("created_by", authorization.userId)
      .eq("status", "pending")
      .lt("created_at", staleCutoff)
      .order("created_at", { ascending: true })
      .limit(remaining);

    if (stalePendingError) {
      console.error("Voice recording cleanup queue load failed", {
        stage: "stale-pending",
        code: stalePendingError.code,
        message: stalePendingError.message,
      });
      return { ok: false as const, cleaned: 0, failed: 0 };
    }

    queuedIds.push(...(stalePending ?? []).map((recording) => recording.id));
  }

  let cleaned = 0;
  let failed = 0;
  for (const recordingId of queuedIds) {
    const result = await cancelVoiceRecordingById(
      admin,
      authorization.userId,
      recordingId,
    );
    if (result.ok) cleaned += 1;
    else failed += 1;
  }

  return failed > 0
    ? { ok: false as const, cleaned, failed }
    : { ok: true as const, cleaned, failed: 0 };
}
