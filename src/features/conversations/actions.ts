"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  generateBasicEslamReply,
  persistAssistantMessage,
} from "@/features/conversations/assistant";
import { isUuid, MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";
import { loadConversation } from "@/features/conversations/data";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type MessageActionState = {
  content: string;
  error: "invalid_input" | "save_failed" | null;
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

async function generateAndPersistReply(userId: string, conversationId: string) {
  try {
    const thread = await loadConversation(userId, conversationId);
    if (!thread) {
      throw new Error("Conversation disappeared before response generation.");
    }

    const assistantContent = await generateBasicEslamReply(thread.messages);
    await persistAssistantMessage(userId, conversationId, assistantContent);
    return true;
  } catch (error) {
    console.error("assistant response failed", {
      message: error instanceof Error ? error.message : "Unknown assistant response error",
    });
    return false;
  }
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

  if (conversationId === null) {
    const { data, error } = await supabase.rpc(
      "create_conversation_with_first_message",
      { p_content: content },
    );

    if (error || !data) {
      console.error("conversation creation failed", {
        code: error?.code,
        message: error?.message,
      });
      return failure("save_failed");
    }

    const responseSaved = await generateAndPersistReply(userId, data);
    redirectToConversation(data, responseSaved);
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    content,
  });

  if (error) {
    console.error("conversation message insert failed", {
      code: error.code,
      message: error.message,
    });
    return failure("save_failed");
  }

  const responseSaved = await generateAndPersistReply(userId, conversationId);
  redirectToConversation(conversationId, responseSaved);
}
