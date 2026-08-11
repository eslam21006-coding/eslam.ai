import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const schema = readSource(
  "supabase/migrations/20260811141604_create_conversations_and_messages.sql",
);
const atomicCreate = readSource(
  "supabase/migrations/20260811141801_create_conversation_with_first_message.sql",
);

test("conversation schema enforces tenant-consistent message ownership", () => {
  assert.match(schema, /create table public\.conversations/);
  assert.match(schema, /create table public\.messages/);
  assert.match(schema, /constraint conversations_id_user_id_key unique \(id, user_id\)/);
  assert.match(
    schema,
    /foreign key \(conversation_id, user_id\)[\s\S]*?references public\.conversations\(id, user_id\)/,
  );
  assert.match(schema, /messages_content_length check \(char_length\(content\) between 1 and 20000\)/);
  assert.match(schema, /messages_role_check check \(role in \('user', 'assistant', 'system'\)\)/);
});

test("conversation and message privileges follow the append-only contract", () => {
  assert.match(schema, /revoke all on table public\.conversations from anon, authenticated/);
  assert.match(schema, /revoke all on table public\.messages from anon, authenticated/);
  assert.match(schema, /grant select, insert, update, delete on table public\.conversations to authenticated/);
  assert.match(schema, /grant select, insert on table public\.messages to authenticated/);
  assert.doesNotMatch(schema, /grant[^;]*update[^;]*on table public\.messages/i);
  assert.doesNotMatch(schema, /grant[^;]*delete[^;]*on table public\.messages/i);
});

test("RLS restricts every conversation operation and user message append", () => {
  for (const operation of ["read", "create", "update", "delete"]) {
    assert.match(schema, new RegExp(`Users can ${operation} their own conversations`));
  }
  assert.match(schema, /Users can read their own messages/);
  assert.match(schema, /Users can append their own user messages/);
  assert.match(
    schema,
    /with check \(\(select auth\.uid\(\)\) = user_id and role = 'user'\)/,
  );
});

test("message insertion updates conversation activity and ordering is indexed", () => {
  assert.match(schema, /create trigger touch_conversation_after_message_insert/);
  assert.match(schema, /update public\.conversations[\s\S]*?set updated_at = now\(\)/);
  assert.match(schema, /conversations_user_activity_idx/);
  assert.match(schema, /messages_conversation_order_idx/);
});

test("first conversation and message are created atomically as the authenticated owner", () => {
  assert.match(atomicCreate, /security invoker/);
  assert.match(atomicCreate, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(atomicCreate, /char_length\(v_content\) > 20000/);
  assert.match(atomicCreate, /insert into public\.conversations \(user_id, title\)/);
  assert.match(atomicCreate, /insert into public\.messages \(conversation_id, user_id, role, content\)/);
  assert.match(atomicCreate, /values \(v_conversation_id, v_user_id, 'user', v_content\)/);
  assert.match(atomicCreate, /grant execute on function public\.create_conversation_with_first_message\(text\) to authenticated/);
});

test("message action derives ownership from auth and preserves failed content", () => {
  const actions = readSource("src/features/conversations/actions.ts");

  assert.match(actions, /requireAuthenticatedUser\(\)/);
  assert.match(actions, /create_conversation_with_first_message/);
  assert.match(actions, /user_id: userId/);
  assert.match(actions, /role: "user"/);
  assert.doesNotMatch(actions, /formData\.get\(["']user_id["']\)/);
  assert.match(actions, /return failure\("save_failed"\)/);
  assert.match(actions, /content,/);
  assert.match(actions, /revalidatePath\("\/app", "layout"\)/);
});

test("conversation reads are owner-scoped and messages have deterministic ordering", () => {
  const data = readSource("src/features/conversations/data.ts");

  assert.match(data, /\.eq\("user_id", userId\)/);
  assert.match(data, /\.eq\("id", conversationId\)/);
  assert.match(data, /\.eq\("conversation_id", conversationId\)/);
  assert.match(data, /\.order\("created_at", \{ ascending: true \}\)/);
  assert.match(data, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(data, /CONVERSATION_LIST_LIMIT/);
});

test("persisted chat routes and composer are connected without AI generation", () => {
  const newPage = readSource("src/app/app/chat/page.tsx");
  const threadPage = readSource("src/app/app/chat/[conversationId]/page.tsx");
  const composer = readSource("src/features/conversations/conversation-composer.tsx");

  assert.match(newPage, /<ConversationComposer \/>/);
  assert.match(threadPage, /loadConversation\(userId, conversationId\)/);
  assert.match(threadPage, /notFound\(\)/);
  assert.match(threadPage, /thread\.messages\.map/);
  assert.match(threadPage, /conversationId=\{conversationId\}/);
  assert.match(composer, /useActionState\(persistUserMessageAction, initialState\)/);
  assert.doesNotMatch(`${newPage}\n${threadPage}\n${composer}`, /openai|responses\.create|chat\.completions/i);
});

test("runtime isolation regression is part of CI", () => {
  const runtime = readSource("supabase/tests/conversations_rls_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(runtime, /RLS leak: user B can read user A conversation/);
  assert.match(runtime, /RLS leak: user B can read user A messages/);
  assert.match(runtime, /foreign_key_violation/);
  assert.match(runtime, /Authenticated client forged an assistant message/);
  assert.match(runtime, /rollback;/);
  assert.match(ci, /conversations_rls_runtime\.sql/);
});

test("generated database types include conversations messages and atomic RPC", () => {
  const types = readSource("src/types/database.ts");

  assert.match(types, /conversations:/);
  assert.match(types, /messages:/);
  assert.match(types, /messages_conversation_owner_fkey/);
  assert.match(types, /create_conversation_with_first_message:/);
  assert.match(types, /Args: \{ p_content: string \}/);
});
