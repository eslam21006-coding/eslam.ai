import "server-only";

import { randomUUID } from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const GENERATION_LOCK_SECONDS = 300;

export async function claimConversationGeneration(
  userId: string,
  conversationId: string,
): Promise<string | null> {
  const token = randomUUID();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_conversation_generation", {
    p_user_id: userId,
    p_conversation_id: conversationId,
    p_token: token,
    p_lock_seconds: GENERATION_LOCK_SECONDS,
  });

  if (error) {
    console.error("conversation generation claim failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to claim conversation generation.");
  }

  return data ? token : null;
}

export async function releaseConversationGeneration(
  userId: string,
  conversationId: string,
  token: string,
) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("release_conversation_generation", {
    p_user_id: userId,
    p_conversation_id: conversationId,
    p_token: token,
  });

  if (error || !data) {
    console.error("conversation generation release failed", {
      code: error?.code,
      message: error?.message,
      released: data,
    });
  }
}
