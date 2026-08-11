import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("conversation follows the latest message without trapping users at the bottom", () => {
  const chat = readSource("src/features/conversations/conversation-chat.tsx");

  assert.match(chat, /new IntersectionObserver/);
  assert.match(chat, /followingLatestRef/);
  assert.match(chat, /endRef\.current\?\.scrollIntoView/);
  assert.match(chat, /setShowJumpToLatest\(!atLatest\)/);
  assert.match(chat, /آخر رسالة/);
  assert.match(chat, /scrollToLatest\("smooth"\)/);
  assert.match(chat, /window\.requestAnimationFrame/);
});

test("streaming assistant has a clear pre-token state and robust mixed-text wrapping", () => {
  const chat = readSource("src/features/conversations/conversation-chat.tsx");

  assert.match(chat, /waitingForFirstToken/);
  assert.match(chat, /aria-label="إسلام يكتب"/);
  assert.match(chat, /role="status"/);
  assert.match(chat, /dir="auto"/);
  assert.match(chat, /overflow-wrap:anywhere/);
});

test("successful streaming keeps the optimistic turn visible until persisted props catch up", () => {
  const chat = readSource("src/features/conversations/conversation-chat.tsx");

  assert.match(chat, /optimisticBaseMessageCount/);
  assert.match(chat, /initialMessages\.length > optimisticBaseMessageCount/);
  assert.match(chat, /visibleOptimisticTurn = optimisticTurnIsPersisted \? null : optimisticTurn/);
  assert.match(chat, /streaming=\{streaming\}/);
  assert.doesNotMatch(chat, /setOptimisticTurn\(null\);\n\s*const cleanConversationUrl/);
  assert.doesNotMatch(chat, /optimisticBaseMessageCountRef/);
});

test("composer supports chat keyboard semantics, auto-grow, and desktop focus recovery", () => {
  const composer = readSource("src/features/conversations/conversation-composer.tsx");

  assert.match(composer, /event\.key !== "Enter"/);
  assert.match(composer, /event\.shiftKey/);
  assert.match(composer, /event\.nativeEvent\.isComposing/);
  assert.match(composer, /requestSubmit\(\)/);
  assert.match(composer, /Math\.min\(textarea\.scrollHeight, 160\)/);
  assert.match(composer, /matchMedia\("\(pointer: fine\)"\)/);
  assert.match(composer, /focus\(\{ preventScroll: true \}\)/);
  assert.match(composer, /Shift \+ Enter لسطر جديد/);
});

test("conversation history keeps the active thread visible and improves the empty state", () => {
  const shell = readSource("src/features/app-shell/app-shell.tsx");

  assert.match(shell, /activeConversationRef/);
  assert.match(shell, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(shell, /border-\[var\(--gold-muted\)\]/);
  assert.match(shell, /ابدأ أول محادثة/);
});

test("Task 09 remains UX-only and does not introduce later-stage intelligence", () => {
  const sources = [
    readSource("src/features/conversations/conversation-chat.tsx"),
    readSource("src/features/conversations/conversation-composer.tsx"),
    readSource("src/features/app-shell/app-shell.tsx"),
  ].join("\n");

  assert.doesNotMatch(
    sources,
    /business_dna|eslam_principles|eslam_playbooks|file_search|web_search|vector_store|tools:/i,
  );
});
