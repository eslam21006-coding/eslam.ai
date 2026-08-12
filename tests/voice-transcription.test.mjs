import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

const validRecordingId = "11111111-1111-4111-8111-111111111111";

test("voice transcription validates ids, lease state, and model resolution", async () => {
  const {
    VOICE_TRANSCRIPTION_LEASE_SECONDS,
    VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
    VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH,
    isVoiceTranscriptionLeaseActive,
    resolveVoiceTranscriptionModel,
    validateVoiceTranscriptionInput,
  } = await importSource("src/features/voice-transcription/core.ts");

  assert.equal(VOICE_TRANSCRIPTION_LEASE_SECONDS, 420);
  assert.equal(VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES, 25 * 1024 * 1024);
  assert.equal(VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH, 250_000);
  assert.equal(resolveVoiceTranscriptionModel(undefined), "gpt-4o-transcribe");
  assert.equal(resolveVoiceTranscriptionModel("  gpt-4o-mini-transcribe  "), "gpt-4o-mini-transcribe");
  assert.deepEqual(validateVoiceTranscriptionInput({ recordingId: validRecordingId }), {
    recordingId: validRecordingId,
  });
  assert.equal(validateVoiceTranscriptionInput({ recordingId: "bad-id" }), null);
  assert.equal(validateVoiceTranscriptionInput(null), null);
  assert.equal(isVoiceTranscriptionLeaseActive("2030-01-01T00:00:00.000Z", 0), true);
  assert.equal(isVoiceTranscriptionLeaseActive("2020-01-01T00:00:00.000Z", Date.now()), false);
  assert.equal(isVoiceTranscriptionLeaseActive(null), false);
});

test("voice transcription migrations provide service-only fenced retry state", () => {
  const migration = readSource(
    "supabase/migrations/20260812191232_create_voice_transcription_workflow.sql",
  );
  const hardening = readSource(
    "supabase/migrations/20260812193219_harden_voice_transcription_lease_validation.sql",
  );

  assert.match(migration, /create table public\.voice_transcriptions/);
  assert.match(migration, /voice_recording_id uuid not null unique references public\.voice_recordings/);
  assert.match(migration, /status in \('processing', 'completed', 'failed'\)/);
  assert.match(migration, /claim_token uuid/);
  assert.match(migration, /lease_expires_at timestamptz/);
  assert.match(migration, /alter table public\.voice_transcriptions enable row level security/);
  assert.match(migration, /revoke all on table public\.voice_transcriptions from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.voice_transcriptions to service_role/);
  assert.match(migration, /create or replace function public\.claim_voice_transcription/);
  assert.match(migration, /on conflict \(voice_recording_id\) do update/);
  assert.match(migration, /attempt_count = public\.voice_transcriptions\.attempt_count \+ 1/);
  assert.match(migration, /public\.voice_transcriptions\.lease_expires_at <= v_now/);
  assert.match(migration, /create or replace function public\.complete_voice_transcription/);
  assert.match(migration, /and claim_token = p_claim_token/);
  assert.match(migration, /create or replace function public\.fail_voice_transcription/);
  assert.match(migration, /completed voice transcriptions are immutable/);
  assert.match(
    migration,
    /revoke all on function public\.claim_voice_transcription\(uuid, uuid, text, integer\) from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_voice_transcription\(uuid, uuid, text, integer\) to service_role/,
  );
  assert.match(
    hardening,
    /if p_lease_seconds is null or p_lease_seconds not between 60 and 1800 then/,
  );
});

test("transcription action stays admin-only, server-only, and never writes Brain", () => {
  const actions = readSource("src/features/voice-transcription/actions.ts");
  const openaiClient = readSource("src/lib/openai/client.ts");

  assert.match(actions, /^"use server";/);
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /\.rpc\("claim_voice_transcription"/);
  assert.match(actions, /\.from\("voice_recordings"\)/);
  assert.match(actions, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(actions, /\.from\(recording\.storage_bucket\)[\s\S]*\.download\(recording\.storage_path\)/);
  assert.match(actions, /new File\(\[audioBlob\], fileName/);
  assert.match(actions, /const model = getOpenAITranscriptionModel\(\)/);
  assert.match(actions, /audio\.transcriptions\.create\(\{[\s\S]*model,[\s\S]*prompt: VOICE_TRANSCRIPTION_PROMPT/);
  assert.match(actions, /\.rpc\(\s*"complete_voice_transcription"/);
  assert.match(actions, /fail_voice_transcription/);
  assert.doesNotMatch(actions, /eslam_brain_items|eslam_brain_versions|teaching_sources/);
  assert.match(openaiClient, /^import "server-only";/);
  assert.match(openaiClient, /resolveVoiceTranscriptionModel\(process\.env\.OPENAI_TRANSCRIPTION_MODEL\)/);
  assert.match(openaiClient, /OPENAI_TRANSCRIPTION_TIMEOUT_MS = 225_000/);
  assert.match(openaiClient, /OPENAI_TRANSCRIPTION_MAX_RETRIES = 0/);
});

test("transcription UI loads paginated owner-scoped source artifacts and exposes safe retry controls", () => {
  const data = readSource("src/features/voice-transcription/data.ts");
  const button = readSource("src/features/voice-transcription/transcribe-button.tsx");
  const list = readSource("src/features/voice-transcription/transcription-list.tsx");
  const page = readSource("src/app/admin/teach/voice/page.tsx");
  const recorderActions = readSource("src/features/voice-recorder/actions.ts");

  assert.match(data, /VOICE_TRANSCRIPTION_PAGE_SIZE = 20/);
  assert.match(data, /\.from\("voice_recordings"\)/);
  assert.match(data, /\.eq\("created_by", userId\)/);
  assert.match(data, /\.eq\("status", "uploaded"\)/);
  assert.match(data, /\.range\(offset, offset \+ VOICE_TRANSCRIPTION_PAGE_SIZE\)/);
  assert.match(data, /\.from\("voice_transcriptions"\)/);
  assert.match(data, /if \(!recording\.uploaded_at \|\| !recording\.size_bytes\) return \[\]/);
  assert.match(data, /durationMs: recording\.duration_ms \?\? 0/);
  assert.match(data, /isVoiceTranscriptionLeaseActive/);
  assert.match(button, /transcribeVoiceRecordingAction/);
  assert.match(button, /router\.refresh\(\)/);
  assert.match(button, /catch \(error\)/);
  assert.match(button, /aria-live="polite"/);
  assert.match(button, /role="status"/);
  assert.doesNotMatch(button, /\{message \? \(\s*<p[\s\S]*aria-live="polite"/);
  assert.match(list, /التسجيلات المحفوظة/);
  assert.match(list, /hasPrevious/);
  assert.match(list, /hasNext/);
  assert.match(list, /transcript/i);
  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /requestedPage/);
  assert.match(
    page,
    /loadVoiceTranscriptionList\([\s\S]*authorization\.userId,[\s\S]*requestedPage,[\s\S]*\)/,
  );
  assert.match(page, /export const maxDuration = 300/);
  assert.match(page, /Task 20/);
  assert.match(recorderActions, /import \{ revalidatePath \} from "next\/cache"/);
  assert.match(recorderActions, /const VOICE_ADMIN_PATH = "\/admin\/teach\/voice"/);
  assert.match(
    recorderActions,
    /function finalizedVoiceRecording[\s\S]*revalidatePath\(VOICE_ADMIN_PATH\)/,
  );
});

test("voice transcription runtime regression is registered in CI and env config stays server-only", () => {
  const ci = readSource(".github/workflows/ci.yml");
  const env = readSource(".env.example");
  const runtime = readSource("supabase/tests/voice_transcriptions_runtime.sql");

  assert.match(ci, /supabase\/tests\/voice_transcriptions_runtime\.sql/);
  assert.match(env, /OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_OPENAI/);
  assert.match(runtime, /expired_retry_claim/);
  assert.match(runtime, /expired processing lease was not reclaimed/);
  assert.match(runtime, /null transcription lease returned unexpected error/);
});
