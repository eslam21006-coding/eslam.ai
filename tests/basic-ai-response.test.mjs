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
  assert.match(adminClient, /^import "server-only";/);
  assert.match(adminClient, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_OPENAI_API_KEY/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
});

test("streaming OpenAI boundary reuses the bounded request contract with store disabled", () => {
  const assistant = readSource("src/features/conversations/assistant.ts");
  const request = readSource("src/features/conversations/assistant-request.ts");
  const events = readSource("src/features/conversations/assistant-stream-events.ts");

  assert.match(assistant, /buildBasicEslamStreamingResponseRequest/);
  assert.match(assistant, /responses\.create\(request, \{/);
  assert.match(assistant, /signal: options\.signal/);
  assert.match(request, /MAX_MODEL_TRANSCRIPT_MESSAGES = 64/);
  assert.match(request, /MAX_ESTIMATED_TRANSCRIPT_TOKENS = 32_000/);
  assert.match(request, /store: false/);
  assert.match(request, /stream: true/);
  assert.match(events, /response\.output_text\.delta/);
  assert.match(events, /response\.refusal\.delta/);
  assert.match(events, /response\.completed/);
  assert.match(events, /response\.failed/);
  assert.match(events, /response\.incomplete/);
  assert.doesNotMatch(`${assistant}\n${request}\n${events}`, /file_search|web_search|vector_store/i);
});

test("assistant persistence remains backend-only while streamed user turns use authenticated RLS", () => {
  const assistant = readSource("src/features/conversations/assistant.ts");
  const serverFlow = readSource("src/features/conversations/response-flow-server.ts");
  const adminClient = readSource("src/lib/supabase/admin.ts");
  const privilegeMigration = readSource(
    "supabase/migrations/20260811142816_restrict_conversation_column_privileges.sql",
  );

  assert.match(assistant, /getSupabaseAdminClient\(\)/);
  assert.match(assistant, /role: "assistant"/);
  assert.match(serverFlow, /createClient\(\)/);
  assert.match(serverFlow, /user_id: ownerId/);
  assert.match(serverFlow, /role: "user"/);
  assert.match(adminClient, /persistSession: false/);
  assert.doesNotMatch(privilegeMigration, /grant insert[^;]*assistant/i);
});

test("stream route holds the generation lease and invalidates persisted conversation data", () => {
  const route = readSource("src/app/api/chat/stream/route.ts");
  const preparation = readSource("src/features/conversations/response-flow.ts");
  const streamingFlow = readSource("src/features/conversations/streaming-response-flow.ts");

  assert.match(route, /prepareMessageResponseFlow/);
  assert.match(route, /executePreparedStreamingResponse/);
  assert.match(route, /X-Eslam-Conversation-Id/);
  assert.match(route, /no-store, no-transform/);
  assert.match(route, /ReadableStream<Uint8Array>/);
  assert.match(route, /upstreamAbort\.abort\(\)/);
  assert.match(route, /revalidatePath\(`\/app\/chat\/\$\{conversationId\}`\)/);
  assert.match(route, /revalidatePath\("\/app", "layout"\)/);
  assert.ok(preparation.indexOf("dependencies.claimGeneration(userId, conversationId)") < preparation.indexOf("dependencies.insertUserMessage"));
  assert.match(streamingFlow, /persistAssistant/);
  assert.match(streamingFlow, /finally/);
  assert.match(streamingFlow, /releasePreparedTurn/);
});

test("streaming UI consumes fetch body, survives strict-mode effect replay, and refreshes persisted data", () => {
  const chat = readSource("src/features/conversations/conversation-chat.tsx");
  const threadPage = readSource("src/app/app/chat/[conversationId]/page.tsx");
  const composer = readSource("src/features/conversations/conversation-composer.tsx");
  const button = readSource("src/features/conversations/message-submit-button.tsx");

  assert.match(chat, /fetch\("\/api\/chat\/stream"/);
  assert.match(chat, /response\.body\.getReader\(\)/);
  assert.match(chat, /decoder\.decode\(value, \{ stream: true \}\)/);
  assert.match(chat, /assistant: current\.assistant \+ delta/);
  assert.match(chat, /mountedRef\.current = true/);
  assert.match(chat, /abortRef\.current\?\.abort\(\)/);
  assert.match(chat, /new FormData\(event\.currentTarget\)/);
  assert.match(chat, /const startsNewThread = targetConversationId !== conversationId/);
  assert.match(chat, /if \(startsNewThread \|\| clearResponseErrorOnSuccess\)/);
  assert.match(chat, /router\.replace\(cleanConversationUrl/);
  assert.match(chat, /router\.refresh\(\)/);
  assert.match(threadPage, /clearResponseErrorOnSuccess=\{responseFailed\}/);
  assert.match(composer, /value \?\? fallbackState\.content/);
  assert.match(composer, /disabled=\{streaming\}/);
  assert.match(composer, /useActionState/);
  assert.doesNotMatch(composer, /value \|\| fallbackState\.content/);
  assert.match(button, /streaming \|\| actionPending/);
});

test("Task 10 injects Business DNA without later-stage intelligence or tools", () => {
  const sources = [
    readSource("src/app/api/chat/stream/route.ts"),
    readSource("src/features/conversations/assistant.ts"),
    readSource("src/features/conversations/assistant-request.ts"),
    readSource("src/features/conversations/actions.ts"),
    readSource("src/features/conversations/conversation-chat.tsx"),
  ].join("\n");

  assert.match(sources, /businessDnaContext|loadBusinessDnaModelContext/);
  assert.doesNotMatch(sources, /eslam_principles|eslam_playbooks|file_search|web_search|vector_store|tools:/i);
});
