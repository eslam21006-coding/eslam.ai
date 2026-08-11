import assert from "node:assert/strict";
import test from "node:test";

import { buildBasicEslamResponseRequest } from "../src/features/conversations/assistant-request.ts";
import { executeMessageResponseFlow } from "../src/features/conversations/response-flow.ts";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const conversationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeDependencies(overrides = {}) {
  const events = [];
  const transcript = [
    { role: "user", content: "older user" },
    { role: "assistant", content: "older assistant" },
    { role: "user", content: "new user" },
  ];

  const dependencies = {
    createConversation: async () => {
      events.push("create_conversation");
      return conversationId;
    },
    claimGeneration: async () => {
      events.push("claim");
      return { status: "claimed", token: "lease-token" };
    },
    releaseGeneration: async () => {
      events.push("release");
    },
    insertUserMessage: async () => {
      events.push("insert_user");
    },
    loadConversation: async () => {
      events.push("load_transcript");
      return { messages: transcript };
    },
    generateReply: async (messages) => {
      events.push("openai");
      assert.deepEqual(messages, transcript);
      return "assistant reply";
    },
    persistAssistant: async (_ownerId, _conversationId, content) => {
      events.push("persist_assistant");
      assert.equal(content, "assistant reply");
    },
    reportError: (stage) => {
      events.push(`error:${stage}`);
    },
    ...overrides,
  };

  return { events, transcript, dependencies };
}

test("request builder sends a bounded recent transcript with store disabled", () => {
  const messages = [
    { role: "system", content: "must not be replayed" },
    ...Array.from({ length: 70 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn-${index}`,
    })),
  ];

  const request = buildBasicEslamResponseRequest(messages, "gpt-5-mini");

  assert.equal(request.model, "gpt-5-mini");
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, 1800);
  assert.equal(request.input.length, 64);
  assert.equal(request.input.at(-1)?.content, "turn-69");
  assert.equal(request.input.some((message) => message.role === "system"), false);
  assert.match(request.instructions, /Reply primarily in Arabic/);
});

test("existing conversation persists user before loading transcript and generating reply", async () => {
  const { events, dependencies } = makeDependencies();

  const result = await executeMessageResponseFlow(
    { userId, conversationId, content: "new user" },
    dependencies,
  );

  assert.deepEqual(result, {
    kind: "redirect",
    conversationId,
    responseSaved: true,
  });
  assert.deepEqual(events, [
    "claim",
    "insert_user",
    "load_transcript",
    "openai",
    "persist_assistant",
    "release",
  ]);
});

test("assistant persistence failure preserves the saved user turn and releases the lease", async () => {
  const { events, dependencies } = makeDependencies({
    persistAssistant: async () => {
      events.push("persist_assistant");
      throw new Error("database unavailable");
    },
  });

  const result = await executeMessageResponseFlow(
    { userId, conversationId, content: "new user" },
    dependencies,
  );

  assert.deepEqual(result, {
    kind: "redirect",
    conversationId,
    responseSaved: false,
  });
  assert.deepEqual(events, [
    "claim",
    "insert_user",
    "load_transcript",
    "openai",
    "persist_assistant",
    "error:assistant_response",
    "release",
  ]);
  assert.equal(events.includes("insert_user"), true);
});

test("busy conversation rejects the unsaved concurrent turn before insert", async () => {
  const { events, dependencies } = makeDependencies({
    claimGeneration: async () => {
      events.push("claim");
      return { status: "busy" };
    },
  });

  const result = await executeMessageResponseFlow(
    { userId, conversationId, content: "concurrent turn" },
    dependencies,
  );

  assert.deepEqual(result, { kind: "form_error", error: "response_in_progress" });
  assert.deepEqual(events, ["claim"]);
});

test("generation lease infrastructure failure does not insert an existing turn", async () => {
  const { events, dependencies } = makeDependencies({
    claimGeneration: async () => {
      events.push("claim");
      return { status: "failed" };
    },
  });

  const result = await executeMessageResponseFlow(
    { userId, conversationId, content: "retry later" },
    dependencies,
  );

  assert.deepEqual(result, { kind: "form_error", error: "save_failed" });
  assert.deepEqual(events, ["claim"]);
});

test("new conversation keeps its atomic first message when AI generation fails", async () => {
  const { events, dependencies } = makeDependencies({
    generateReply: async () => {
      events.push("openai");
      throw new Error("OpenAI unavailable");
    },
  });

  const result = await executeMessageResponseFlow(
    { userId, conversationId: null, content: "first message" },
    dependencies,
  );

  assert.deepEqual(result, {
    kind: "redirect",
    conversationId,
    responseSaved: false,
  });
  assert.deepEqual(events, [
    "create_conversation",
    "claim",
    "load_transcript",
    "openai",
    "error:assistant_response",
    "release",
  ]);
});
