import "server-only";

import {
  buildBasicEslamResponseRequest,
  buildBasicEslamStreamingResponseRequest,
} from "@/features/conversations/assistant-request";
import { consumeBasicEslamStream } from "@/features/conversations/assistant-stream-events";
import { MAX_MESSAGE_LENGTH, type MessageRecord } from "@/features/conversations/contracts";
import { createWithKnowledgeFallback } from "@/features/conversations/knowledge-response-fallback";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function generateBasicEslamReply(
  messages: MessageRecord[],
  businessDnaContext: string | null = null,
  eslamBrainContext: string | null = null,
  knowledgeVectorStoreId: string | null = null,
  knowledgeSourceAttributionAllowed = false,
) {
  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const response = await createWithKnowledgeFallback(
    knowledgeVectorStoreId,
    (activeKnowledgeVectorStoreId) =>
      client.responses.create(
        buildBasicEslamResponseRequest(
          messages,
          model,
          businessDnaContext,
          eslamBrainContext,
          activeKnowledgeVectorStoreId,
          knowledgeSourceAttributionAllowed,
        ),
      ),
  );

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
  eslamBrainContext: string | null = null,
  knowledgeVectorStoreId: string | null = null,
  knowledgeSourceAttributionAllowed = false,
) {
  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const stream = await createWithKnowledgeFallback(
    knowledgeVectorStoreId,
    (activeKnowledgeVectorStoreId) =>
      client.responses.create(
        buildBasicEslamStreamingResponseRequest(
          messages,
          model,
          businessDnaContext,
          eslamBrainContext,
          activeKnowledgeVectorStoreId,
          knowledgeSourceAttributionAllowed,
        ),
        { signal: options.signal },
      ),
  );

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
