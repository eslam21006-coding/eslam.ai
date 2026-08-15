import "server-only";

import { createClient } from "@supabase/supabase-js";

let knowledgeAdminClient: ReturnType<typeof createClient> | null = null;

/** Returns the server-only Supabase client used by the global Knowledge Library lifecycle. */
export function getKnowledgeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secretKey) {
    throw new Error("Server-side Supabase credentials are not configured.");
  }

  if (!knowledgeAdminClient) {
    knowledgeAdminClient = createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return knowledgeAdminClient;
}
