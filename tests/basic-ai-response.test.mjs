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

test("production OpenAI boundary uses the executable bounded request builder", () => {
  const assistant = readSource("src/features/conversations/assistant.ts");
  const request = readSource("src/features/conversations/assistant-request.ts");

  assert.match(assistant, /buildBasicEslamResponseRequest\(messages, getOpenAIModel\(\)\)/);
  assert.match(assistant, /responses\.create\(request\)/);
  assert.match(assistant, /response\.output_text\.trim\(\)/);
  assert.match(request, /MAX_MODEL_TRANSCRIPT_MESSAGES = 64/);
  assert.match(request, /MAX_ESTIMATED_TRANSCRIPT_TOKENS = 32_000/);
  assert.match(request, /store: false/);
  assert.doesNotMatch(`${assistant}\n${request}`, /stream:\s*true/);
  assert.doesNotMatch(`${assistant}\n${request}`, /business_dna|file_search|web_search|vector_store/i);
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
  const flow = readSource("src/features/conversations/response-flow.ts");
  const lock = readSource("src/features/conversations/generation-lock.ts");
  const migration = readSource(
    "supabase/migrations/20260811183713_add_conversation_generation_lease.sql",
  );
  const runtime = readSource("supabase/tests/conversations_rls_runtime.sql");

  assert.match(lock, /^import "server-only";/);
  assert.match(lock, /randomUUID\(\)/);
  assert.match(lock, /GENERATION_LOCK_SECONDS = 300/);
  assert.match(actions, /executeMessageResponseFlow/);
  assert.ok(flow.indexOf("dependencies.claimGeneration(userId, conversationId)") < flow.indexOf("dependencies.insertUserMessage"));
  assert.match(flow, /claim\.status === "busy"/);
  assert.match(flow, /claim\.status === "failed"/);
  assert.match(migration, /grant execute on function public\.claim_conversation_generation[\s\S]*?to service_role/);
  assert.match(migration, /revoke all on function public\.claim_conversation_generation[\s\S]*?from anon, authenticated/);
  assert.match(runtime, /Concurrent generation lease was incorrectly claimed/);
  assert.match(runtime, /Generation lease released with the wrong token/);
});

test("message action delegates failure-preserving response behavior to the executed coordinator", () => {
  const actions = readSource("src/features/conversations/actions.ts");
  const threadPage = readSource("src/app/app/chat/[conversationId]/page.tsx");
  const composer = readSource("src/features/conversations/conversation-composer.tsx");

  assert.match(actions, /executeMessageResponseFlow/);
  assert.match(actions, /loadConversation,/);
  assert.match(actions, /generateReply: generateBasicEslamReply/);
  assert.match(actions, /persistAssistant: persistAssistantMessage/);
  assert.match(actions, /\?error=response_failed/);
  assert.match(threadPage, /رسالتك محفوظة/);
  assert.match(threadPage, /لا تحتاج لإرسال الرسالة نفسها مرة أخرى/);
  assert.match(composer, /إسلام ما زال ينشئ الرد السابق/);
});

test("Task 07 remains non-streaming and does not inject later-stage context", () => {
  const sources = [
    readSource("src/features/conversations/actions.ts"),
    readSource("src/features/conversations/assistant.ts"),
    readSource("src/features/conversations/assistant-request.ts"),
    readSource("src/features/conversations/response-flow.ts"),
    readSource("src/lib/openai/client.ts"),
  ].join("\n");

  assert.doesNotMatch(sources, /stream:\s*true|ReadableStream|text\/event-stream/i);
  assert.doesNotMatch(sources, /business_dna|eslam_principles|eslam_playbooks|file_search|vector_store/i);
});
