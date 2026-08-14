import assert from "node:assert/strict";
import test from "node:test";

import {
  parseChatStreamBuffer,
  serializeChatStreamEvent,
} from "../src/features/conversations/chat-stream-protocol.ts";

const conversationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("chat stream protocol keeps ready, deltas, failures, and completion as framed application events", () => {
  const expected = [
    { type: "ready", conversationId },
    { type: "delta", delta: "سطر أول\nسطر ثاني" },
    { type: "error", error: "response_failed", userMessageSaved: true },
  ];
  const wire = expected.map(serializeChatStreamEvent).join("");
  const chunks = [wire.slice(0, 11), wire.slice(11, 37), wire.slice(37, 71), wire.slice(71)];

  let buffer = "";
  const actual = [];
  for (const chunk of chunks) {
    buffer += chunk;
    const parsed = parseChatStreamBuffer(buffer);
    buffer = parsed.remainder;
    actual.push(...parsed.events);
  }

  const final = parseChatStreamBuffer(buffer, true);
  actual.push(...final.events);

  assert.equal(final.remainder, "");
  assert.deepEqual(actual, expected);
});

test("chat stream protocol accepts a successful terminal frame", () => {
  const wire = [
    { type: "ready", conversationId },
    { type: "delta", delta: "مرحبا" },
    { type: "done" },
  ]
    .map(serializeChatStreamEvent)
    .join("");

  const parsed = parseChatStreamBuffer(wire, true);
  assert.deepEqual(parsed.events, [
    { type: "ready", conversationId },
    { type: "delta", delta: "مرحبا" },
    { type: "done" },
  ]);
});

test("chat stream protocol rejects malformed or unknown frames", () => {
  assert.throws(
    () => parseChatStreamBuffer('{"type":"unknown"}\n'),
    /Invalid chat stream frame/,
  );
  assert.throws(
    () => parseChatStreamBuffer('{not-json}\n'),
    /Invalid chat stream frame/,
  );
});
