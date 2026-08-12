import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

const validRecordingId = "11111111-1111-4111-8111-111111111111";

test("voice recorder normalizes supported MIME types and maps safe extensions", async () => {
  const {
    normalizeVoiceRecordingMimeType,
    voiceRecordingExtension,
    validateVoiceUploadIntentInput,
  } = await importSource("src/features/voice-recorder/core.ts");

  assert.equal(normalizeVoiceRecordingMimeType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(normalizeVoiceRecordingMimeType(" AUDIO/MP4 "), "audio/mp4");
  assert.equal(normalizeVoiceRecordingMimeType("application/octet-stream"), null);
  assert.equal(voiceRecordingExtension("audio/webm"), "webm");
  assert.equal(voiceRecordingExtension("audio/mp4"), "m4a");
  assert.equal(voiceRecordingExtension("audio/mpeg"), "mp3");
  assert.deepEqual(validateVoiceUploadIntentInput({ mimeType: "audio/ogg;codecs=opus" }), {
    mimeType: "audio/ogg",
  });
  assert.equal(validateVoiceUploadIntentInput({ mimeType: "video/webm" }), null);
});

test("voice recorder validates duration, identity, and one-hour size budget", async () => {
  const {
    VOICE_RECORDING_AUDIO_BITS_PER_SECOND,
    VOICE_RECORDING_MAX_BYTES,
    VOICE_RECORDING_MAX_DURATION_MS,
    validateVoiceFinalizeInput,
    validateVoiceRecordingId,
    formatVoiceDuration,
  } = await importSource("src/features/voice-recorder/core.ts");

  assert.deepEqual(
    validateVoiceFinalizeInput({ recordingId: validRecordingId, durationMs: 65_000 }),
    { recordingId: validRecordingId, durationMs: 65_000 },
  );
  assert.equal(validateVoiceFinalizeInput({ recordingId: "not-a-uuid", durationMs: 1000 }), null);
  assert.equal(
    validateVoiceFinalizeInput({
      recordingId: validRecordingId,
      durationMs: VOICE_RECORDING_MAX_DURATION_MS + 1,
    }),
    null,
  );
  assert.equal(validateVoiceFinalizeInput({ recordingId: validRecordingId, durationMs: 1.5 }), null);
  assert.equal(validateVoiceRecordingId({ recordingId: validRecordingId }), validRecordingId);
  assert.equal(formatVoiceDuration(65_000), "01:05");
  assert.equal(formatVoiceDuration(3_661_000), "1:01:01");

  const oneHourEncodedBytes =
    (VOICE_RECORDING_AUDIO_BITS_PER_SECOND * VOICE_RECORDING_MAX_DURATION_MS) / 8 / 1000;
  assert.ok(oneHourEncodedBytes < VOICE_RECORDING_MAX_BYTES);
});

test("voice upload actions stay admin-only and verify Storage before finalization", () => {
  const actions = readSource("src/features/voice-recorder/actions.ts");

  assert.match(actions, /^"use server";/);
  assert.equal((actions.match(/requireAdmin\(\)/g) ?? []).length, 3);
  assert.match(actions, /createSignedUploadUrl/);
  assert.match(actions, /\.info\(recording\.storage_path\)/);
  assert.match(actions, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(actions, /\.eq\("status", "pending"\)/);
  assert.match(actions, /status:\s*"uploaded"/);
  assert.match(actions, /VOICE_RECORDING_MAX_BYTES/);
  assert.doesNotMatch(actions, /OPENAI_API_KEY|SUPABASE_SECRET_KEY|eslam_brain_items/);
});

test("browser recorder supports capture controls, local preview, and signed direct upload", () => {
  const recorder = readSource("src/features/voice-recorder/voice-recorder.tsx");

  assert.match(recorder, /^"use client";/);
  assert.match(recorder, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(recorder, /MediaRecorder\.isTypeSupported/);
  assert.match(recorder, /recorder\.pause\(\)/);
  assert.match(recorder, /recorder\.resume\(\)/);
  assert.match(recorder, /recorder\.stop\(\)/);
  assert.match(recorder, /URL\.createObjectURL/);
  assert.match(recorder, /<audio[\s\S]*controls/);
  assert.match(recorder, /uploadToSignedUrl/);
  assert.match(recorder, /createVoiceRecordingUploadAction/);
  assert.match(recorder, /finalizeVoiceRecordingUploadAction/);
  assert.match(recorder, /cancelVoiceRecordingUploadAction/);
  assert.doesNotMatch(recorder, /openai|vector_store|file_search/i);
});

test("voice recorder route is protected and linked from Teach Eslam", () => {
  const page = readSource("src/app/admin/teach/voice/page.tsx");
  const teachPage = readSource("src/app/admin/teach/page.tsx");
  const navigation = readSource("src/features/admin-shell/navigation.ts");

  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /<VoiceRecorder \/>/);
  assert.match(teachPage, /href="\/admin\/teach\/voice"/);
  assert.match(teachPage, />\s*Voice Recorder\s*</);
  assert.match(navigation, /label: "Teach Eslam"/);
});

test("voice recording migration is private, bounded, and service-only", () => {
  const migration = readSource(
    "supabase/migrations/20260812170332_create_voice_recordings.sql",
  );
  const runtime = readSource("supabase/tests/voice_recordings_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");
  const types = readSource("src/types/database.ts");

  assert.match(migration, /create table public\.voice_recordings/);
  assert.match(migration, /alter table public\.voice_recordings enable row level security/);
  assert.match(migration, /revoke all on table public\.voice_recordings from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.voice_recordings to service_role/);
  assert.match(migration, /'eslam-voice-recordings'/);
  assert.match(migration, /26214400/);
  assert.match(migration, /array\['audio\/webm', 'audio\/mp4', 'audio\/ogg', 'audio\/mpeg', 'audio\/wav'\]/);
  assert.match(migration, /public,\s*file_size_limit,\s*allowed_mime_types/);
  assert.match(runtime, /authenticated role unexpectedly read voice recordings/);
  assert.match(runtime, /anon role unexpectedly inserted a voice recording/);
  assert.match(ci, /supabase\/tests\/voice_recordings_runtime\.sql/);
  assert.match(types, /voice_recordings:/);
});
