import { MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";

type StreamEvent = {
  type: string;
  delta?: string;
  text?: string;
  refusal?: string;
};

type StreamOptions = {
  onDelta(delta: string): void;
};

function visibleDelta(event: StreamEvent, currentContent: string) {
  if (
    event.type === "response.output_text.delta" ||
    event.type === "response.refusal.delta"
  ) {
    return typeof event.delta === "string" ? event.delta : "";
  }

  if (currentContent.length === 0 && event.type === "response.output_text.done") {
    return typeof event.text === "string" ? event.text : "";
  }

  if (currentContent.length === 0 && event.type === "response.refusal.done") {
    return typeof event.refusal === "string" ? event.refusal : "";
  }

  return "";
}

export async function consumeBasicEslamStream(
  events: AsyncIterable<StreamEvent>,
  options: StreamOptions,
) {
  let content = "";
  let completed = false;

  for await (const event of events) {
    if (event.type === "response.failed") {
      throw new Error("OpenAI streaming response failed.");
    }
    if (event.type === "response.incomplete") {
      throw new Error("OpenAI streaming response was incomplete.");
    }
    if (event.type === "response.completed") {
      completed = true;
      continue;
    }

    const delta = visibleDelta(event, content);
    if (!delta) continue;

    if (content.length + delta.length > MAX_MESSAGE_LENGTH) {
      throw new Error("OpenAI streaming response exceeds the message limit.");
    }

    content += delta;
    options.onDelta(delta);
  }

  if (!completed) {
    throw new Error("OpenAI stream ended before response.completed.");
  }

  const finalContent = content.trim();
  if (!finalContent) {
    throw new Error("OpenAI streaming response text is empty.");
  }

  return finalContent;
}
