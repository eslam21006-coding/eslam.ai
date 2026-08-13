export const CHAT_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export type ChatStreamEvent =
  | { type: "ready"; conversationId: string }
  | { type: "delta"; delta: string }
  | { type: "error"; error: "response_failed"; userMessageSaved: true }
  | { type: "done" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChatStreamEvent(value: unknown): ChatStreamEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid chat stream frame.");
  }

  if (
    value.type === "ready" &&
    typeof value.conversationId === "string" &&
    value.conversationId.length > 0
  ) {
    return { type: "ready", conversationId: value.conversationId };
  }

  if (value.type === "delta" && typeof value.delta === "string") {
    return { type: "delta", delta: value.delta };
  }

  if (
    value.type === "error" &&
    value.error === "response_failed" &&
    value.userMessageSaved === true
  ) {
    return {
      type: "error",
      error: "response_failed",
      userMessageSaved: true,
    };
  }

  if (value.type === "done") {
    return { type: "done" };
  }

  throw new Error("Invalid chat stream frame.");
}

export function serializeChatStreamEvent(event: ChatStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function parseChatStreamBuffer(buffer: string, final = false) {
  const lines = buffer.split("\n");
  const remainder = final ? "" : (lines.pop() ?? "");

  if (final && lines.at(-1) === "") {
    lines.pop();
  }

  const events = lines
    .filter((line) => line.length > 0)
    .map((line) => {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        throw new Error("Invalid chat stream frame.");
      }
      return parseChatStreamEvent(value);
    });

  return { events, remainder };
}
