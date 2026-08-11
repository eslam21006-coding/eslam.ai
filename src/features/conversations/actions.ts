"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";
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

function readConversationId(formData: FormData) {
  const value = formData.get("conversation_id");
  return typeof value === "string" && value.length > 0 ? value : null;
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

  if (content.length < 1 || content.length > MAX_MESSAGE_LENGTH) {
    return failure("invalid_input");
  }

  const userId = await requireAuthenticatedUser();
  const supabase = await createClient();

  if (!conversationId) {
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

    revalidatePath("/app", "layout");
    redirect(`/app/chat/${data}`);
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

  revalidatePath(`/app/chat/${conversationId}`);
  revalidatePath("/app", "layout");
  redirect(`/app/chat/${conversationId}`);
}
