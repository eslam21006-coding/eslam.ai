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
const privilegeMigration = readSource(
  "supabase/migrations/20260811142816_restrict_conversation_column_privileges.sql",
);
const ownershipIndexMigration = readSource(
  "supabase/migrations/20260811143116_index_message_conversation_owner.sql",
);
const activityMigration = readSource(
  "supabase/migrations/20260811145416_secure_conversation_activity_timestamp.sql",
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
  assert.match(
    ownershipIndexMigration,
    /create index messages_conversation_owner_idx[\s\S]*?on public\.messages\(conversation_id, user_id\)/,
  );
});

test("conversation and message privileges follow the append-only least-privilege contract", () => {
  assert.match(privilegeMigration, /revoke all on table public\.conversations from authenticated/);
  assert.match(privilegeMigration, /revoke all on table public\.messages from authenticated/);
  assert.match(privilegeMigration, /grant select on table public\.conversations to authenticated/);
  assert.match(privilegeMigration, /grant insert \(user_id, title\) on table public\.conversations to authenticated/);
  assert.match(privilegeMigration, /grant delete on table public\.conversations to authenticated/);
  assert.match(privilegeMigration, /grant select on table public\.messages to authenticated/);
  assert.match(privilegeMigration, /grant insert \(conversation_id, user_id, role, content\) on table public\.messages to authenticated/);
  assert.doesNotMatch(privilegeMigration, /grant[^;]*update[^;]*on table public\.messages/i);
  assert.doesNotMatch(privilegeMigration, /grant[^;]*delete[^;]*on table public\.messages/i);
  assert.doesNotMatch(privilegeMigration, /insert \([^)]*created_at/i);

  assert.match(activityMigration, /security definer/);
  assert.match(activityMigration, /set search_path = ''/);
  assert.match(
    activityMigration,
    /revoke all on function public\.touch_conversation_after_message_insert\(\) from public, anon, authenticated/,
  );
  assert.match(
    activityMigration,
    /revoke update \(updated_at\) on table public\.conversations from authenticated/,
  );
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
  assert.match(activityMigration, /update public\.conversations[\s\S]*?set updated_at = now\(\)/);
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

test("conversation IDs are validated before database access or append", () => {
  const contracts = readSource("src/features/conversations/contracts.ts");
  const data = readSource("src/features/conversations/data.ts");
  const actions = readSource("src/features/conversations/actions.ts");

  assert.match(contracts, /UUID_PATTERN/);
  assert.match(contracts, /export function isUuid/);
  assert.match(data, /if \(!isUuid\(conversationId\)\) return null;/);
  assert.match(actions, /if \(typeof value !== "string" \|\| !isUuid\(value\)\) return false;/);
  assert.match(actions, /conversationId === false/);
  assert.match(actions, /return failure\("invalid_input"\)/);
});

test("message action derives ownership from auth and preserves failed content", () => {
  const actions = readSource("src/features/conversations/actions.ts");

  assert.match(actions, /requireAuthenticatedUser\(\)/);
  assert.match(actions, /executeMessageResponseFlow/);
  assert.match(actions, /\{ userId, conversationId, content \}/);
  assert.match(actions, /create_conversation_with_first_message/);
  assert.match(actions, /user_id: ownerId/);
  assert.match(actions, /role: "user"/);
  assert.doesNotMatch(actions, /formData\.get\(["']user_id["']\)/);
  assert.match(actions, /return failure\(result\.error\)/);
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

test("persisted chat routes and composer remain UI-only", () => {
  const newPage = readSource("src/app/app/chat/page.tsx");
  const threadPage = readSource("src/app/app/chat/[conversationId]/page.tsx");
  const composer = readSource("src/features/conversations/conversation-composer.tsx");

  assert.match(newPage, /<ConversationComposer \/>/);
  assert.match(threadPage, /loadConversation\(userId, conversationId\)/);
  assert.match(threadPage, /notFound\(\)/);
  assert.match(threadPage, /thread\.messages\.map/);
  assert.match(threadPage, /conversationId=\{conversationId\}/);
  assert.match(threadPage, /className="sr-only"/);
  assert.match(threadPage, /isUser \? "أنت:"/);
  assert.match(threadPage, /message\.role === "assistant" \? "إسلام:" : "النظام:"/);
  assert.match(composer, /useActionState\(persistUserMessageAction, initialState\)/);
  assert.doesNotMatch(`${newPage}\n${threadPage}\n${composer}`, /openai|responses\.create|chat\.completions/i);
});

test("conversation history exposes a navigation landmark and list semantics", () => {
  const shell = readSource("src/features/app-shell/app-shell.tsx");

  assert.match(shell, /<nav[\s\S]*?aria-label="المحادثات السابقة"/);
  assert.match(shell, /<ul className="mt-2 grid list-none gap-1">/);
  assert.match(shell, /<li key=\{conversation\.id\}/);
  assert.match(shell, /title=\{conversation\.title\}/);
});

test("runtime isolation regression is part of CI", () => {
  const runtime = readSource("supabase/tests/conversations_rls_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(runtime, /RLS leak: user B can read user A conversation/);
  assert.match(runtime, /RLS leak: user B can read user A messages/);
  assert.match(runtime, /RLS leak: user B updated user A conversation/);
  assert.match(runtime, /RLS leak: user B deleted user A conversation/);
  assert.match(runtime, /foreign_key_violation/);
  assert.match(runtime, /Authenticated client forged an assistant message/);
  assert.match(runtime, /Concurrent generation lease was incorrectly claimed/);
  assert.match(runtime, /rollback;/);
  assert.match(ci, /conversations_rls_runtime\.sql/);
});

test("generated database types include conversations messages and response RPCs", () => {
  const types = readSource("src/types/database.ts");

  assert.match(types, /conversations:/);
  assert.match(types, /generation_lock_token: string \| null/);
  assert.match(types, /messages:/);
  assert.match(types, /messages_conversation_owner_fkey/);
  assert.match(types, /create_conversation_with_first_message:/);
  assert.match(types, /claim_conversation_generation:/);
  assert.match(types, /release_conversation_generation:/);
  assert.match(types, /Args: \{ p_content: string \}/);
});
