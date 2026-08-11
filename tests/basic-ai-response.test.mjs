import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("OpenAI SDK is pinned and server-only credentials stay private", () => {
  const packageJson = JSON.parse(readSource("package.json"));
  const env = readSource(".env.example");
  const openaiClient = readSource("src/lib/openai/client.ts");
  const adminClient = readSource("src/lib/supabase/admin.ts");

  assert.equal(packageJson.dependencies.openai, "7.1.0");
  assert.match(openaiClient, /^import "server-only";/);
  assert.match(openaiClient, /process\.env\.OPENAI_API_KEY/);
  assert.match(openaiClient, /"gpt-5-mini"/);
  assert.match(openaiClient, /const OPENAI_TIMEOUT_MS = 45_000/);
  assert.match(openaiClient, /const OPENAI_MAX_RETRIES = 1/);
  assert.match(openaiClient, /maxRetries: OPENAI_MAX_RETRIES/);
  assert.match(openaiClient, /timeout: OPENAI_TIMEOUT_MS/);
  assert.match(adminClient, /^import "server-only";/);
  assert.match(adminClient, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_OPENAI_API_KEY/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
});

test("basic Eslam reply uses a bounded persisted transcript with Responses API and no OpenAI storage", () => {
  const assistant = readSource("src/features/conversations/assistant.ts");

  assert.match(assistant, /ResponseInputItem/);
  assert.match(assistant, /MAX_MODEL_TRANSCRIPT_MESSAGES = 64/);
  assert.match(assistant, /MAX_ESTIMATED_TRANSCRIPT_TOKENS = 32_000/);
  assert.match(assistant, /estimateMessageTokens/);
  assert.match(assistant, /for \(let index = replayable\.length - 1/);
  assert.match(assistant, /selected\.reverse\(\)\.map/);
  assert.match(assistant, /responses\.create\(/);
  assert.match(assistant, /instructions: BASIC_ESLAM_INSTRUCTIONS/);
  assert.match(assistant, /store: false/);
  assert.match(assistant, /response\.output_text\.trim\(\)/);
  assert.doesNotMatch(assistant, /stream:\s*true/);
  assert.doesNotMatch(assistant, /business_dna|file_search|web_search|vector_store/i);
});

test("assistant messages use a backend-only privileged client while browser RLS remains unchanged", () => {
  const assistant = readSource("src/features/conversations/assistant.ts");
  const adminClient = readSource("src/lib/supabase/admin.ts");
  const privilegeMigration = readSource(
    "supabase/migrations/20260811142816_restrict_conversation_column_privileges.sql",
  );

  assert.match(assistant, /getSupabaseAdminClient\(\)/);
  assert.match(assistant, /role: "assistant"/);
  assert.match(adminClient, /persistSession: false/);
  assert.match(adminClient, /autoRefreshToken: false/);
  assert.doesNotMatch(privilegeMigration, /grant insert[^;]*assistant/i);
  assert.match(
    privilegeMigration,
    /grant insert \(conversation_id, user_id, role, content\) on table public\.messages to authenticated/,
  );
});

test("generation leases serialize existing conversation turns across server instances", () => {
  const actions = readSource("src/features/conversations/actions.ts");
  const lock = readSource("src/features/conversations/generation-lock.ts");
  const migration = readSource(
    "supabase/migrations/20260811183713_add_conversation_generation_lease.sql",
  );
  const runtime = readSource("supabase/tests/conversations_rls_runtime.sql");

  assert.match(lock, /^import "server-only";/);
  assert.match(lock, /randomUUID\(\)/);
  assert.match(lock, /GENERATION_LOCK_SECONDS = 180/);
  assert.match(lock, /claim_conversation_generation/);
  assert.match(lock, /release_conversation_generation/);
  assert.match(actions, /response_in_progress/);
  assert.ok(actions.indexOf("claimGenerationOrNull(userId, conversationId)") < actions.indexOf('.from("messages").insert'));
  assert.match(migration, /grant execute on function public\.claim_conversation_generation[\s\S]*?to service_role/);
  assert.match(migration, /revoke all on function public\.claim_conversation_generation[\s\S]*?from anon, authenticated/);
  assert.match(runtime, /Concurrent generation lease was incorrectly claimed/);
  assert.match(runtime, /Generation lease released with the wrong token/);
});

test("message action preserves the user turn when AI fails and preserves unsaved text when busy", () => {
  const actions = readSource("src/features/conversations/actions.ts");
  const threadPage = readSource("src/app/app/chat/[conversationId]/page.tsx");
  const composer = readSource("src/features/conversations/conversation-composer.tsx");

  assert.match(actions, /loadConversation\(userId, conversationId\)/);
  assert.match(actions, /generateBasicEslamReply\(thread\.messages\)/);
  assert.match(actions, /persistAssistantMessage\(userId, conversationId, assistantContent\)/);
  assert.match(actions, /\?error=response_failed/);
  assert.match(threadPage, /رسالتك محفوظة/);
  assert.match(threadPage, /لا تحتاج لإرسال الرسالة نفسها مرة أخرى/);
  assert.match(composer, /إسلام ما زال ينشئ الرد السابق/);
});

test("Task 07 remains non-streaming and does not inject later-stage context", () => {
  const sources = [
    readSource("src/features/conversations/actions.ts"),
    readSource("src/features/conversations/assistant.ts"),
    readSource("src/lib/openai/client.ts"),
  ].join("\n");

  assert.doesNotMatch(sources, /stream:\s*true|ReadableStream|text\/event-stream/i);
  assert.doesNotMatch(sources, /business_dna|eslam_principles|eslam_playbooks|file_search|vector_store/i);
});
