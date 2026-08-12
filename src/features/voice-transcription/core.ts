export const VOICE_TRANSCRIPTION_LEASE_SECONDS = 420;
export const VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH = 250_000;
export const VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const VOICE_TRANSCRIPTION_DEFAULT_MODEL = "gpt-4o-transcribe";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const VOICE_TRANSCRIPTION_PROMPT = [
  "Transcribe the recording faithfully in its original spoken language.",
  "The speaker often mixes Egyptian Arabic with English business and technical terminology.",
  "Preserve spoken English terms in Latin letters when identifiable, including product names, acronyms, metrics, and software names.",
  "Do not translate, summarize, teach, classify, rewrite, or add information that was not spoken.",
].join(" ");

export type VoiceTranscriptionActionResult =
  | { ok: true; state: "completed"; transcriptionId: string }
  | { ok: true; state: "processing"; transcriptionId: string | null }
  | {
      ok: false;
      error:
        | "invalid-request"
        | "not-found"
        | "audio-too-large"
        | "storage-download"
        | "transcription-failed"
        | "finalize-conflict";
    };

export function resolveVoiceTranscriptionModel(value: string | undefined) {
  return value?.trim() || VOICE_TRANSCRIPTION_DEFAULT_MODEL;
}

export function validateVoiceTranscriptionInput(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const recordingId = "recordingId" in input ? input.recordingId : null;
  if (typeof recordingId !== "string" || !UUID_RE.test(recordingId)) return null;
  return { recordingId };
}

export function isVoiceTranscriptionLeaseActive(leaseExpiresAt: string | null, nowMs = Date.now()) {
  if (!leaseExpiresAt) return false;
  const leaseMs = Date.parse(leaseExpiresAt);
  return Number.isFinite(leaseMs) && leaseMs > nowMs;
}
