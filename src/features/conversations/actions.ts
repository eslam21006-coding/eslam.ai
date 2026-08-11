"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadBusinessDnaModelContext } from "@/features/business-dna/model-context-data";
import {
  generateBasicEslamReply,
  persistAssistantMessage,
} from "@/features/conversations/assistant";
import { isUuid, MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";
import { executeMessageResponseFlow } from "@/features/conversations/response-flow";
import { createResponsePreparationDependencies } from "@/features/conversations/response-flow-server";
import { requireAuthenticatedUser } from "@/lib/auth/session";

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
  const businessDnaContext = await loadBusinessDnaModelContext(userId);
  const preparationDependencies = await createResponsePreparationDependencies();
  const result = await executeMessageResponseFlow(
    { userId, conversationId, content },
    {
      ...preparationDependencies,
      generateReply: (messages) =>
        generateBasicEslamReply(messages, businessDnaContext),
      persistAssistant: persistAssistantMessage,
    },
  );

  if (result.kind === "form_error") {
    return failure(result.error);
  }

  redirectToConversation(result.conversationId, result.responseSaved);
}
