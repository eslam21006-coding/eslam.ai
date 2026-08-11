import type { Tables } from "@/types/database";

export const MAX_MESSAGE_LENGTH = 20000;
export const MAX_CONVERSATION_TITLE_LENGTH = 160;
export const CONVERSATION_LIST_LIMIT = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

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
