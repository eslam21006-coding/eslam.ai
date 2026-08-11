import type { Tables } from "@/types/database";

export const MAX_MESSAGE_LENGTH = 20000;
export const MAX_CONVERSATION_TITLE_LENGTH = 160;
export const CONVERSATION_LIST_LIMIT = 50;

export type ConversationNavItem = Pick<
  Tables<"conversations">,
  "id" | "title" | "updated_at"
>;

export type ConversationRecord = Pick<
  Tables<"conversations">,
  "id" | "title" | "created_at" | "updated_at"
>;

export type MessageRecord = Pick<
  Tables<"messages">,
  "id" | "role" | "content" | "created_at"
>;
