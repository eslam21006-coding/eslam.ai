import "server-only";

import { type MessageRecord } from "@/features/conversations/contracts";
import { loadConversation } from "@/features/conversations/data";
import {
  claimConversationGeneration,
  releaseConversationGeneration,
} from "@/features/conversations/generation-lock";
import type {
  GenerationClaim,
  ResponsePreparationDependencies,
} from "@/features/conversations/response-flow";
import { createClient } from "@/lib/supabase/server";

async function claimGeneration(
  userId: string,
  conversationId: string,
): Promise<GenerationClaim> {
  try {
    const token = await claimConversationGeneration(userId, conversationId);
    return token ? { status: "claimed", token } : { status: "busy" };
  } catch (error) {
    console.error("conversation generation lock unavailable", {
      message: error instanceof Error ? error.message : "Unknown generation lock error",
    });
    return { status: "failed" };
  }
}

export async function createResponsePreparationDependencies(): Promise<
  ResponsePreparationDependencies<MessageRecord>
> {
  const supabase = await createClient();

  return {
    createConversation: async (firstMessage) => {
      const { data, error } = await supabase.rpc(
        "create_conversation_with_first_message",
        { p_content: firstMessage },
      );
      if (error || !data) {
        throw new Error(error?.message || "Conversation creation returned no ID.");
      }
      return data;
    },
    claimGeneration,
    releaseGeneration: releaseConversationGeneration,
    insertUserMessage: async (ownerId, conversationId, content) => {
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: ownerId,
        role: "user",
        content,
      });
      if (error) throw new Error(error.message);
    },
    loadConversation,
    reportError: (stage, error) => {
      console.error("message response flow failed", {
        stage,
        message: error instanceof Error ? error.message : "Unknown response flow error",
      });
    },
  };
}
