"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  generateBasicEslamReply,
  persistAssistantMessage,
} from "@/features/conversations/assistant";
import { isUuid, MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";
import { loadConversation } from "@/features/conversations/data";
import {
  claimConversationGeneration,
  releaseConversationGeneration,
} from "@/features/conversations/generation-lock";
import {
  executeMessageResponseFlow,
  type GenerationClaim,
} from "@/features/conversations/response-flow";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type MessageActionState = {
  content: string;
  error: "invalid_input" | "save_failed" | "response_in_progress" | null;
  revision: number;
};

function readContent(formData: FormData) {
  const value = formData.get("content");
  return typeof value === "string" ? value.trim() : "";
}

function readConversationId(formData: FormData): string | null | false {
  const value = formData.get("conversation_id");
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isUuid(value)) return false;
  return value;
}

function redirectToConversation(conversationId: string, responseSaved: boolean): never {
  revalidatePath(`/app/chat/${conversationId}`);
  revalidatePath("/app", "layout");
  redirect(
    responseSaved
      ? `/app/chat/${conversationId}`
      : `/app/chat/${conversationId}?error=response_failed`,
  );
}

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

export async function persistUserMessageAction(
  previousState: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const content = readContent(formData);
  const conversationId = readConversationId(formData);
  const failure = (error: MessageActionState["error"]): MessageActionState => ({
    content,
    error,
    revision: previousState.revision + 1,
  });

  if (
    content.length < 1 ||
    content.length > MAX_MESSAGE_LENGTH ||
    conversationId === false
  ) {
    return failure("invalid_input");
  }

  const userId = await requireAuthenticatedUser();
  const supabase = await createClient();

  const result = await executeMessageResponseFlow(
    { userId, conversationId, content },
    {
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
      insertUserMessage: async (ownerId, targetConversationId, messageContent) => {
        const { error } = await supabase.from("messages").insert({
          conversation_id: targetConversationId,
          user_id: ownerId,
          role: "user",
          content: messageContent,
        });
        if (error) throw new Error(error.message);
      },
      loadConversation,
      generateReply: generateBasicEslamReply,
      persistAssistant: persistAssistantMessage,
      reportError: (stage, error) => {
        console.error("message response flow failed", {
          stage,
          message: error instanceof Error ? error.message : "Unknown response flow error",
        });
      },
    },
  );

  if (result.kind === "form_error") {
    return failure(result.error);
  }

  redirectToConversation(result.conversationId, result.responseSaved);
}
