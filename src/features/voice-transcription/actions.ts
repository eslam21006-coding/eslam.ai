"use server";

import { revalidatePath } from "next/cache";

import {
  VOICE_TRANSCRIPTION_LEASE_SECONDS,
  VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
  VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH,
  VOICE_TRANSCRIPTION_PROMPT,
  type VoiceTranscriptionActionResult,
  validateVoiceTranscriptionInput,
} from "@/features/voice-transcription/core";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getOpenAITranscriptionClient,
  getOpenAITranscriptionModel,
} from "@/lib/openai/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const VOICE_PAGE = "/admin/teach/voice";

type ClaimRow = {
  transcription_id: string | null;
  claim_state: string;
  attempt_count: number;
  claim_token: string | null;
  transcript_text: string | null;
};

async function failClaimedAttempt(
  transcriptionId: string,
  userId: string,
  claimToken: string,
  errorCode: string,
) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("fail_voice_transcription", {
    p_transcription_id: transcriptionId,
    p_created_by: userId,
    p_claim_token: claimToken,
    p_error_code: errorCode,
  });

  if (error || data !== true) {
    console.error("Voice transcription failure state could not be persisted", {
      transcriptionId,
      errorCode,
      code: error?.code,
      message: error?.message ?? "Attempt was no longer owned by this worker",
    });
  }
}

/** Transcribes one uploaded admin recording without publishing anything to Brain. */
export async function transcribeVoiceRecordingAction(
  input: unknown,
): Promise<VoiceTranscriptionActionResult> {
  const authorization = await requireAdmin();
  const validated = validateVoiceTranscriptionInput(input);
  if (!validated) return { ok: false, error: "invalid-request" };

  const admin = getSupabaseAdminClient();
  const model = getOpenAITranscriptionModel();
  const { data: claimRows, error: claimError } = await admin.rpc("claim_voice_transcription", {
    p_recording_id: validated.recordingId,
    p_created_by: authorization.userId,
    p_model: model,
    p_lease_seconds: VOICE_TRANSCRIPTION_LEASE_SECONDS,
  });

  if (claimError) {
    console.error("Voice transcription claim failed", {
      recordingId: validated.recordingId,
      code: claimError.code,
      message: claimError.message,
    });
    return { ok: false, error: "transcription-failed" };
  }

  const claim = (claimRows?.[0] ?? null) as ClaimRow | null;
  if (!claim || claim.claim_state === "not_found") return { ok: false, error: "not-found" };
  if (claim.claim_state === "completed" && claim.transcription_id) {
    return { ok: true, state: "completed", transcriptionId: claim.transcription_id };
  }
  if (claim.claim_state === "busy") {
    return {
      ok: true,
      state: "processing",
      transcriptionId: claim.transcription_id ?? null,
    };
  }
  if (claim.claim_state !== "claimed" || !claim.transcription_id || !claim.claim_token) {
    console.error("Voice transcription returned an invalid claim state", {
      recordingId: validated.recordingId,
      state: claim.claim_state,
    });
    return { ok: false, error: "transcription-failed" };
  }

  const transcriptionId = claim.transcription_id;
  const claimToken = claim.claim_token;

  const { data: recording, error: recordingError } = await admin
    .from("voice_recordings")
    .select("id,storage_bucket,storage_path,status,mime_type,size_bytes")
    .eq("id", validated.recordingId)
    .eq("created_by", authorization.userId)
    .eq("status", "uploaded")
    .maybeSingle();

  if (recordingError || !recording || !recording.size_bytes) {
    console.error("Voice transcription source recording could not be loaded", {
      recordingId: validated.recordingId,
      code: recordingError?.code,
      message: recordingError?.message ?? "Uploaded source recording missing",
    });
    await failClaimedAttempt(transcriptionId, authorization.userId, claimToken, "source-not-found");
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "not-found" };
  }

  if (recording.size_bytes > VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES) {
    await failClaimedAttempt(transcriptionId, authorization.userId, claimToken, "audio-too-large");
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "audio-too-large" };
  }

  const { data: audioBlob, error: downloadError } = await admin.storage
    .from(recording.storage_bucket)
    .download(recording.storage_path);

  if (
    downloadError ||
    !audioBlob ||
    audioBlob.size <= 0 ||
    audioBlob.size !== recording.size_bytes ||
    audioBlob.size > VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES
  ) {
    console.error("Voice transcription source download failed validation", {
      recordingId: recording.id,
      expectedBytes: recording.size_bytes,
      receivedBytes: audioBlob?.size ?? null,
      message: downloadError?.message ?? "Downloaded audio size did not match metadata",
    });
    await failClaimedAttempt(transcriptionId, authorization.userId, claimToken, "storage-download");
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "storage-download" };
  }

  let transcriptText: string;
  try {
    const fileName = recording.storage_path.split("/").at(-1) ?? `${recording.id}.audio`;
    const audioFile = new File([audioBlob], fileName, {
      type: recording.mime_type,
    });
    const transcription = await getOpenAITranscriptionClient().audio.transcriptions.create({
      file: audioFile,
      model,
      prompt: VOICE_TRANSCRIPTION_PROMPT,
    });

    transcriptText = transcription.text.trim();
    if (
      transcriptText.length === 0 ||
      transcriptText.length > VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH
    ) {
      throw new Error("Transcription returned an empty or oversized transcript");
    }
  } catch (error) {
    console.error("OpenAI voice transcription failed", {
      recordingId: recording.id,
      transcriptionId,
      model,
      message: error instanceof Error ? error.message : "Unknown transcription error",
    });
    await failClaimedAttempt(
      transcriptionId,
      authorization.userId,
      claimToken,
      "openai-transcription",
    );
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "transcription-failed" };
  }

  const { data: completed, error: completeError } = await admin.rpc(
    "complete_voice_transcription",
    {
      p_transcription_id: transcriptionId,
      p_created_by: authorization.userId,
      p_claim_token: claimToken,
      p_transcript_text: transcriptText,
    },
  );

  if (completeError || completed !== true) {
    console.error("Voice transcription completion lost its claim", {
      recordingId: recording.id,
      transcriptionId,
      code: completeError?.code,
      message: completeError?.message ?? "Claim token no longer owns this attempt",
    });
    revalidatePath(VOICE_PAGE);
    return { ok: false, error: "finalize-conflict" };
  }

  revalidatePath(VOICE_PAGE);
  return { ok: true, state: "completed", transcriptionId };
}
