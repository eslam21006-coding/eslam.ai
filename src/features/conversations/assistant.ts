import "server-only";

import { buildBasicEslamResponseRequest } from "@/features/conversations/assistant-request";
import { MAX_MESSAGE_LENGTH, type MessageRecord } from "@/features/conversations/contracts";
import { getOpenAIClient, getOpenAIModel } from "@/lib/openai/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function generateBasicEslamReply(messages: MessageRecord[]) {
  const request = buildBasicEslamResponseRequest(messages, getOpenAIModel());
  const response = await getOpenAIClient().responses.create(request);

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
