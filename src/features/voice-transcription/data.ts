import "server-only";

import { isVoiceTranscriptionLeaseActive } from "@/features/voice-transcription/core";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const VOICE_TRANSCRIPTION_PAGE_SIZE = 20;

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

export type VoiceTranscriptionPage = {
  items: VoiceTranscriptionListItem[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/** Loads one deterministic page of the current admin's uploaded voice sources and transcript artifacts. */
export async function loadVoiceTranscriptionList(
  userId: string,
  page = 1,
): Promise<VoiceTranscriptionPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * VOICE_TRANSCRIPTION_PAGE_SIZE;
  const admin = getSupabaseAdminClient();
  const { data: recordingRows, error: recordingsError } = await admin
    .from("voice_recordings")
    .select("id,uploaded_at,duration_ms,size_bytes,mime_type")
    .eq("created_by", userId)
    .eq("status", "uploaded")
    .order("uploaded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + VOICE_TRANSCRIPTION_PAGE_SIZE);

  if (recordingsError) {
    throw new Error(`Unable to load voice recordings: ${recordingsError.code}`);
  }

  const hasNext = (recordingRows?.length ?? 0) > VOICE_TRANSCRIPTION_PAGE_SIZE;
  const recordings = (recordingRows ?? []).slice(0, VOICE_TRANSCRIPTION_PAGE_SIZE);
  if (!recordings.length) {
    return {
      items: [],
      page: safePage,
      hasPrevious: safePage > 1,
      hasNext: false,
    };
  }

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

  const items = recordings.flatMap((recording): VoiceTranscriptionListItem[] => {
    if (!recording.uploaded_at || !recording.size_bytes) return [];
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
        durationMs: recording.duration_ms ?? 0,
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

  return {
    items,
    page: safePage,
    hasPrevious: safePage > 1,
    hasNext,
  };
}
