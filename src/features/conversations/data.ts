import "server-only";

import {
  CONVERSATION_LIST_LIMIT,
  isUuid,
  type ConversationNavItem,
  type ConversationRecord,
  type MessageRecord,
} from "@/features/conversations/contracts";
import { createClient } from "@/lib/supabase/server";

export async function listConversations(userId: string): Promise<ConversationNavItem[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONVERSATION_LIST_LIMIT);

  if (error) {
    console.error("conversation list failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return data;
}

export async function loadConversation(
  userId: string,
  conversationId: string,
): Promise<{ conversation: ConversationRecord; messages: MessageRecord[] } | null> {
  if (!isUuid(conversationId)) return null;

  const supabase = await createClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id,title,created_at,updated_at")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (conversationError) {
    console.error("conversation load failed", {
      code: conversationError.code,
      message: conversationError.message,
    });
    throw new Error("Unable to load conversation.");
  }

  if (!conversation) return null;

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (messagesError) {
    console.error("conversation messages load failed", {
      code: messagesError.code,
      message: messagesError.message,
    });
    throw new Error("Unable to load conversation messages.");
  }

  return { conversation, messages };
}
