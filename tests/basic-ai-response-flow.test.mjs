import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBasicEslamResponseRequest,
  buildBasicEslamStreamingResponseRequest,
} from "../src/features/conversations/assistant-request.ts";
import { consumeBasicEslamStream } from "../src/features/conversations/assistant-stream-events.ts";
import {
  executeMessageResponseFlow,
  prepareMessageResponseFlow,
} from "../src/features/conversations/response-flow.ts";
import { executePreparedStreamingResponse } from "../src/features/conversations/streaming-response-flow.ts";

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

async function* streamEvents(values) {
  for (const value of values) yield value;
}

test("blocking and streaming requests share the bounded transcript and storage policy", () => {
  const messages = [
    { role: "system", content: "must not be replayed" },
    ...Array.from({ length: 70 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn-${index}`,
    })),
  ];

  const blocking = buildBasicEslamResponseRequest(messages, "gpt-5-mini");
  const streaming = buildBasicEslamStreamingResponseRequest(messages, "gpt-5-mini");

  assert.equal(blocking.model, "gpt-5-mini");
  assert.equal(blocking.store, false);
  assert.equal(blocking.max_output_tokens, 1800);
  assert.equal(blocking.input.length, 64);
  assert.equal(blocking.input.at(-1)?.content, "turn-69");
  assert.equal(blocking.input.some((message) => message.role === "system"), false);
  assert.match(blocking.instructions, /Reply primarily in Arabic/);
  assert.deepEqual(streaming.input, blocking.input);
  assert.equal(streaming.store, false);
  assert.equal(streaming.stream, true);
});

test("existing conversation persists user before loading transcript and generating fallback reply", async () => {
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

test("stream preparation claims, saves, and loads before generation begins", async () => {
  const { events, transcript, dependencies } = makeDependencies();

  const prepared = await prepareMessageResponseFlow(
    { userId, conversationId, content: "new user" },
    dependencies,
  );

  assert.deepEqual(prepared, {
    kind: "ready",
    conversationId,
    claimToken: "lease-token",
    messages: transcript,
  });
  assert.deepEqual(events, ["claim", "insert_user", "load_transcript"]);
});

test("assistant persistence failure preserves the saved user turn and releases the fallback lease", async () => {
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
});

test("busy conversation rejects the unsaved concurrent turn before insert", async () => {
  const { events, dependencies } = makeDependencies({
    claimGeneration: async () => {
      events.push("claim");
      return { status: "busy" };
    },
  });

  const result = await prepareMessageResponseFlow(
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

  const result = await prepareMessageResponseFlow(
    { userId, conversationId, content: "retry later" },
    dependencies,
  );

  assert.deepEqual(result, { kind: "form_error", error: "save_failed" });
  assert.deepEqual(events, ["claim"]);
});

test("new conversation keeps its atomic first message when fallback AI generation fails", async () => {
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

test("stream event accumulator emits only visible text and requires response.completed", async () => {
  const deltas = [];
  const result = await consumeBasicEslamStream(
    streamEvents([
      { type: "response.created" },
      { type: "response.output_text.delta", delta: "مرح" },
      { type: "response.output_text.delta", delta: "با" },
      { type: "response.completed" },
    ]),
    {
      maxMessageLength: 20_000,
      onDelta: (delta) => deltas.push(delta),
    },
  );

  assert.equal(result, "مرحبا");
  assert.deepEqual(deltas, ["مرح", "با"]);
});

test("stream event accumulator supports refusal text without exposing reasoning events", async () => {
  const deltas = [];
  const result = await consumeBasicEslamStream(
    streamEvents([
      { type: "response.reasoning_text.delta", delta: "private reasoning" },
      { type: "response.refusal.delta", delta: "لا أستطيع" },
      { type: "response.completed" },
    ]),
    {
      maxMessageLength: 20_000,
      onDelta: (delta) => deltas.push(delta),
    },
  );

  assert.equal(result, "لا أستطيع");
  assert.deepEqual(deltas, ["لا أستطيع"]);
});

test("failed, incomplete, and truncated streams are rejected", async () => {
  await assert.rejects(
    consumeBasicEslamStream(
      streamEvents([{ type: "response.failed" }]),
      { maxMessageLength: 20_000, onDelta() {} },
    ),
    /failed/,
  );
  await assert.rejects(
    consumeBasicEslamStream(
      streamEvents([{ type: "response.incomplete" }]),
      { maxMessageLength: 20_000, onDelta() {} },
    ),
    /incomplete/,
  );
  await assert.rejects(
    consumeBasicEslamStream(
      streamEvents([{ type: "response.output_text.delta", delta: "partial" }]),
      { maxMessageLength: 20_000, onDelta() {} },
    ),
    /before response\.completed/,
  );
});

test("streaming lifecycle persists final text before releasing the lease", async () => {
  const events = [];
  const streamed = [];
  const abortController = new AbortController();

  await executePreparedStreamingResponse(
    {
      userId,
      prepared: {
        conversationId,
        claimToken: "lease-token",
        messages: [{ role: "user", content: "hello" }],
      },
      signal: abortController.signal,
      onDelta: (delta) => streamed.push(delta),
    },
    {
      streamReply: async (_messages, options) => {
        events.push("stream");
        options.onDelta("hello ");
        options.onDelta("back");
        return "hello back";
      },
      persistAssistant: async (_ownerId, _targetId, content) => {
        events.push(`persist:${content}`);
      },
      releaseGeneration: async () => {
        events.push("release");
      },
      reportError: (stage) => events.push(`error:${stage}`),
    },
  );

  assert.deepEqual(streamed, ["hello ", "back"]);
  assert.deepEqual(events, ["stream", "persist:hello back", "release"]);
});

test("aborted streaming response never persists partial assistant text and still releases", async () => {
  const events = [];
  const abortController = new AbortController();

  await assert.rejects(
    executePreparedStreamingResponse(
      {
        userId,
        prepared: {
          conversationId,
          claimToken: "lease-token",
          messages: [{ role: "user", content: "hello" }],
        },
        signal: abortController.signal,
        onDelta() {},
      },
      {
        streamReply: async () => {
          events.push("stream");
          abortController.abort();
          return "partial assistant";
        },
        persistAssistant: async () => {
          events.push("persist");
        },
        releaseGeneration: async () => {
          events.push("release");
        },
        reportError: (stage) => events.push(`error:${stage}`),
      },
    ),
    { name: "AbortError" },
  );

  assert.deepEqual(events, ["stream", "release"]);
});

test("streaming assistant persistence failure releases the lease and surfaces failure", async () => {
  const events = [];
  const abortController = new AbortController();

  await assert.rejects(
    executePreparedStreamingResponse(
      {
        userId,
        prepared: {
          conversationId,
          claimToken: "lease-token",
          messages: [{ role: "user", content: "hello" }],
        },
        signal: abortController.signal,
        onDelta() {},
      },
      {
        streamReply: async () => {
          events.push("stream");
          return "assistant reply";
        },
        persistAssistant: async () => {
          events.push("persist");
          throw new Error("database unavailable");
        },
        releaseGeneration: async () => {
          events.push("release");
        },
        reportError: (stage) => events.push(`error:${stage}`),
      },
    ),
    /database unavailable/,
  );

  assert.deepEqual(events, [
    "stream",
    "persist",
    "error:assistant_persist",
    "release",
  ]);
});
