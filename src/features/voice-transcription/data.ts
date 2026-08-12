import "server-only";

import { isVoiceTranscriptionLeaseActive } from "@/features/voice-transcription/core";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type VoiceTranscriptionListItem = {
  recordingId: string;
  uploadedAt: string;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  transcriptionId: string | null;
  transcriptionStatus: string | null;
  model: string | null;
  transcriptText: string | null;
  attemptCount: number | null;
  leaseExpiresAt: string | null;
  completedAt: string | null;
  lastErrorCode: string | null;
  canTranscribe: boolean;
};

/** Loads only the current admin's uploaded voice sources and derived transcript artifacts. */
export async function loadVoiceTranscriptionList(userId: string) {
  const admin = getSupabaseAdminClient();
  const { data: recordings, error: recordingsError } = await admin
    .from("voice_recordings")
    .select("id,uploaded_at,duration_ms,size_bytes,mime_type")
    .eq("created_by", userId)
    .eq("status", "uploaded")
    .order("uploaded_at", { ascending: false })
    .limit(20);

  if (recordingsError) {
    throw new Error(`Unable to load voice recordings: ${recordingsError.code}`);
  }

  if (!recordings?.length) return [] satisfies VoiceTranscriptionListItem[];

  const recordingIds = recordings.map((recording) => recording.id);
  const { data: transcriptions, error: transcriptionsError } = await admin
    .from("voice_transcriptions")
    .select(
      "id,voice_recording_id,status,model,transcript_text,attempt_count,lease_expires_at,completed_at,last_error_code",
    )
    .eq("created_by", userId)
    .in("voice_recording_id", recordingIds);

  if (transcriptionsError) {
    throw new Error(`Unable to load voice transcriptions: ${transcriptionsError.code}`);
  }

  const byRecordingId = new Map(
    (transcriptions ?? []).map((transcription) => [transcription.voice_recording_id, transcription]),
  );
  const nowMs = Date.now();

  return recordings.flatMap((recording): VoiceTranscriptionListItem[] => {
    if (!recording.uploaded_at || !recording.duration_ms || !recording.size_bytes) return [];
    const transcription = byRecordingId.get(recording.id) ?? null;
    const canTranscribe =
      !transcription ||
      transcription.status === "failed" ||
      (transcription.status === "processing" &&
        !isVoiceTranscriptionLeaseActive(transcription.lease_expires_at, nowMs));

    return [
      {
        recordingId: recording.id,
        uploadedAt: recording.uploaded_at,
        durationMs: recording.duration_ms,
        sizeBytes: recording.size_bytes,
        mimeType: recording.mime_type,
        transcriptionId: transcription?.id ?? null,
        transcriptionStatus: transcription?.status ?? null,
        model: transcription?.model ?? null,
        transcriptText: transcription?.transcript_text ?? null,
        attemptCount: transcription?.attempt_count ?? null,
        leaseExpiresAt: transcription?.lease_expires_at ?? null,
        completedAt: transcription?.completed_at ?? null,
        lastErrorCode: transcription?.last_error_code ?? null,
        canTranscribe,
      },
    ];
  });
}
