import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type KnowledgeLibraryConfigRow = {
  library_key: string;
  vector_store_id: string | null;
  created_at: string;
  updated_at: string;
};

type KnowledgeSourceRow = {
  id: string;
  created_by: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
  title: string;
  original_filename: string;
  mime_type: string;
  declared_size_bytes: number;
  size_bytes: number | null;
  openai_file_id: string | null;
  vector_store_id: string | null;
  last_error_code: string | null;
  index_claim_token: string | null;
  index_lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
  indexed_at: string | null;
};

type KnowledgeIndexClaimRow = {
  source_id: string | null;
  claim_state: string;
  claim_token: string | null;
  previous_openai_file_id: string | null;
  previous_vector_store_id: string | null;
};

type KnowledgeDatabase = {
  public: {
    Tables: {
      knowledge_library_config: {
        Row: KnowledgeLibraryConfigRow;
        Insert: Partial<KnowledgeLibraryConfigRow> & { library_key?: string };
        Update: Partial<KnowledgeLibraryConfigRow>;
        Relationships: [];
      };
      knowledge_sources: {
        Row: KnowledgeSourceRow;
        Insert: Partial<KnowledgeSourceRow> & {
          created_by: string;
          storage_path: string;
          title: string;
          original_filename: string;
          mime_type: string;
          declared_size_bytes: number;
        };
        Update: Partial<KnowledgeSourceRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_knowledge_source_index: {
        Args: {
          p_source_id: string;
          p_created_by: string;
          p_size_bytes: number;
          p_lease_seconds?: number;
        };
        Returns: KnowledgeIndexClaimRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let knowledgeAdminClient: SupabaseClient<KnowledgeDatabase> | null = null;

/** Returns the server-only Supabase client used by the global Knowledge Library lifecycle. */
export function getKnowledgeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secretKey) {
    throw new Error("Server-side Supabase credentials are not configured.");
  }

  if (!knowledgeAdminClient) {
    knowledgeAdminClient = createClient<KnowledgeDatabase>(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return knowledgeAdminClient;
}
