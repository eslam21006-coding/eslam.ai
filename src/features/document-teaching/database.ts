import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database as BaseDatabase } from "@/types/database";

type BasePublic = BaseDatabase["public"];

type DocumentTeachingUploadTable = {
  Row: {
    created_at: string;
    created_by: string;
    declared_size_bytes: number;
    id: string;
    mime_type: string;
    original_filename: string;
    size_bytes: number | null;
    source_id: string | null;
    source_title: string;
    status: string;
    storage_bucket: string;
    storage_path: string;
    uploaded_at: string | null;
  };
  Insert: {
    created_at?: string;
    created_by: string;
    declared_size_bytes: number;
    id?: string;
    mime_type: string;
    original_filename: string;
    size_bytes?: number | null;
    source_id?: string | null;
    source_title: string;
    status?: string;
    storage_bucket?: string;
    storage_path: string;
    uploaded_at?: string | null;
  };
  Update: {
    created_at?: string;
    created_by?: string;
    declared_size_bytes?: number;
    id?: string;
    mime_type?: string;
    original_filename?: string;
    size_bytes?: number | null;
    source_id?: string | null;
    source_title?: string;
    status?: string;
    storage_bucket?: string;
    storage_path?: string;
    uploaded_at?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: "document_teaching_uploads_source_id_fkey";
      columns: ["source_id"];
      isOneToOne: true;
      referencedRelation: "teaching_sources";
      referencedColumns: ["id"];
    },
  ];
};

/** Exact generated Supabase contract for Task 21 layered onto the last committed generated baseline. */
export type DocumentTeachingDatabase = Omit<BaseDatabase, "public"> & {
  public: Omit<BasePublic, "Tables" | "Functions"> & {
    Tables: BasePublic["Tables"] & {
      document_teaching_uploads: DocumentTeachingUploadTable;
    };
    Functions: BasePublic["Functions"] & {
      finalize_document_teaching_upload: {
        Args: {
          p_created_by: string;
          p_document_id: string;
          p_size_bytes: number;
        };
        Returns: string;
      };
    };
  };
};

/** Narrows the existing server-only admin client to the hosted Task 21 database contract. */
export function getDocumentTeachingAdminClient() {
  return getSupabaseAdminClient() as unknown as SupabaseClient<DocumentTeachingDatabase>;
}
