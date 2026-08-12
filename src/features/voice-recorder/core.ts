export const VOICE_RECORDING_BUCKET = "eslam-voice-recordings";
export const VOICE_RECORDING_MAX_BYTES = 25 * 1024 * 1024;
export const VOICE_RECORDING_MAX_DURATION_MS = 60 * 60 * 1000;
export const VOICE_RECORDING_AUDIO_BITS_PER_SECOND = 48_000;

export const VOICE_RECORDING_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
] as const;

export type VoiceRecordingMimeType = (typeof VOICE_RECORDING_MIME_TYPES)[number];

export type VoiceUploadIntent = {
  recordingId: string;
  bucket: typeof VOICE_RECORDING_BUCKET;
  storagePath: string;
  token: string;
  mimeType: VoiceRecordingMimeType;
};

export type VoiceUploadIntentResult =
  | { ok: true; intent: VoiceUploadIntent }
  | { ok: false; error: "invalid-audio" | "create-failed" };

export type VoiceFinalizeResult =
  | { ok: true; recordingId: string; sizeBytes: number }
  | {
      ok: false;
      error: "invalid-request" | "not-found" | "verify-failed" | "finalize-failed";
    };

export type VoiceCancelResult = { ok: true } | { ok: false; error: "invalid-request" | "cancel-failed" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normalizes a MediaRecorder MIME string to the bucket's canonical content type. */
export function normalizeVoiceRecordingMimeType(value: string): VoiceRecordingMimeType | null {
  const baseType = value.split(";", 1)[0]?.trim().toLowerCase();
  return VOICE_RECORDING_MIME_TYPES.includes(baseType as VoiceRecordingMimeType)
    ? (baseType as VoiceRecordingMimeType)
    : null;
}

/** Maps the validated audio MIME type to the extension used in the immutable Storage path. */
export function voiceRecordingExtension(mimeType: VoiceRecordingMimeType) {
  switch (mimeType) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
  }
}

/** Validates the browser-selected audio type before the server creates a signed upload path. */
export function validateVoiceUploadIntentInput(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const mimeTypeValue = (input as { mimeType?: unknown }).mimeType;
  if (typeof mimeTypeValue !== "string") return null;
  const mimeType = normalizeVoiceRecordingMimeType(mimeTypeValue);
  return mimeType ? { mimeType } : null;
}

/** Validates the owner-scoped recording id and active duration submitted after Storage upload. */
export function validateVoiceFinalizeInput(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const { recordingId, durationMs } = input as {
    recordingId?: unknown;
    durationMs?: unknown;
  };

  if (typeof recordingId !== "string" || !UUID_PATTERN.test(recordingId)) return null;
  if (
    typeof durationMs !== "number" ||
    !Number.isInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > VOICE_RECORDING_MAX_DURATION_MS
  ) {
    return null;
  }

  return { recordingId, durationMs };
}

/** Validates a recording id for owner-scoped pending-upload cleanup. */
export function validateVoiceRecordingId(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const recordingId = (input as { recordingId?: unknown }).recordingId;
  return typeof recordingId === "string" && UUID_PATTERN.test(recordingId)
    ? recordingId
    : null;
}

/** Formats an elapsed recording duration as MM:SS or H:MM:SS. */
export function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

/** Formats file size for the recorder preview without exposing implementation units. */
export function formatVoiceBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
