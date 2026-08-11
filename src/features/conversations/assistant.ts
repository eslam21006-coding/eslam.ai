import "server-only";

import {
  buildBasicEslamResponseRequest,
  buildBasicEslamStreamingResponseRequest,
} from "@/features/conversations/assistant-request";
import { consumeBasicEslamStream } from "@/features/conversations/assistant-stream-events";
import { MAX_MESSAGE_LENGTH, type MessageRecord } from "@/features/conversations/contracts";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function generateBasicEslamReply(
  messages: MessageRecord[],
  businessDnaContext: string | null = null,
) {
  const request = buildBasicEslamResponseRequest(
    messages,
    getOpenAIModel(),
    businessDnaContext,
  );
  const response = await getOpenAIClient().responses.create(request);

  const content = response.output_text.trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    throw new Error("OpenAI response text is empty or exceeds the message limit.");
  }

  return content;
}

export async function streamBasicEslamReply(
  messages: MessageRecord[],
  options: {
    signal: AbortSignal;
    onDelta(delta: string): void;
  },
  businessDnaContext: string | null = null,
) {
  const request = buildBasicEslamStreamingResponseRequest(
    messages,
    getOpenAIModel(),
    businessDnaContext,
  );
  const stream = await getOpenAIClient().responses.create(request, {
    signal: options.signal,
  });

  return consumeBasicEslamStream(stream, {
    maxMessageLength: MAX_MESSAGE_LENGTH,
    onDelta: options.onDelta,
  });
}

export async function persistAssistantMessage(
  userId: string,
  conversationId: string,
  content: string,
) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "assistant",
    content,
  });

  if (error) {
    console.error("assistant message insert failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to persist assistant message.");
  }
}
