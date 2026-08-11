import "server-only";

import type { ResponseInputItem } from "openai/resources/responses/responses";

import { MAX_MESSAGE_LENGTH, type MessageRecord } from "@/features/conversations/contracts";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const BASIC_ESLAM_INSTRUCTIONS = [
  "You are Eslam.AI, an AI business and marketing mentor.",
  "Reply primarily in Arabic unless the user writes in English or asks for another language.",
  "Keep familiar marketing and business terms in English when that is clearer and more natural.",
  "Be direct, practical, diagnostic, and specific. Avoid generic motivational filler.",
  "Ask one high-value question only when essential; otherwise give a concrete recommendation or next action.",
  "Do not claim to be the human Eslam Salah, and do not invent facts about the user's business or history.",
].join("\n");

function toResponseInput(messages: MessageRecord[]): ResponseInputItem[] {
  return messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];

    return [
      {
        role: message.role,
        content: message.content,
      } satisfies ResponseInputItem,
    ];
  });
}

export async function generateBasicEslamReply(messages: MessageRecord[]) {
  const input = toResponseInput(messages);
  if (input.length === 0) {
    throw new Error("Conversation does not contain model input.");
  }

  const response = await getOpenAIClient().responses.create({
    model: getOpenAIModel(),
    instructions: BASIC_ESLAM_INSTRUCTIONS,
    input,
    max_output_tokens: 1800,
    store: false,
  });

  const content = response.output_text.trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    throw new Error("OpenAI response text is empty or exceeds the message limit.");
  }

  return content;
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
