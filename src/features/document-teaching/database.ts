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
  Update: Partial<DocumentTeachingUploadTable["Insert"]>;
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

type DocumentTeachingExtractionTable = {
  Row: {
    attempt_count: number;
    claim_token: string | null;
    completed_at: string | null;
    created_at: string;
    created_by: string;
    document_upload_id: string;
    id: string;
    last_error_at: string | null;
    last_error_code: string | null;
    lease_expires_at: string | null;
    model: string;
    processing_started_at: string | null;
    prompt_version: number;
    source_id: string;
    status: string;
    updated_at: string;
  };
  Insert: {
    attempt_count?: number;
    claim_token?: string | null;
    completed_at?: string | null;
    created_at?: string;
    created_by: string;
    document_upload_id: string;
    id?: string;
    last_error_at?: string | null;
    last_error_code?: string | null;
    lease_expires_at?: string | null;
    model: string;
    processing_started_at?: string | null;
    prompt_version?: number;
    source_id: string;
    status: string;
    updated_at?: string;
  };
  Update: Partial<DocumentTeachingExtractionTable["Insert"]>;
  Relationships: [];
};

type DocumentTeachingCandidateTable = {
  Row: {
    content: string;
    created_at: string;
    created_by: string;
    extraction_id: string;
    id: string;
    item_type: string;
    ordinal: number;
    priority: number;
    semantic_layer: string;
    source_excerpt: string;
    source_locator: string;
    summary: string | null;
    title: string;
    topics: string[];
  };
  Insert: {
    content: string;
    created_at?: string;
    created_by: string;
    extraction_id: string;
    id?: string;
    item_type: string;
    ordinal: number;
    priority: number;
    semantic_layer: string;
    source_excerpt: string;
    source_locator: string;
    summary?: string | null;
    title: string;
    topics?: string[];
  };
  Update: Partial<DocumentTeachingCandidateTable["Insert"]>;
  Relationships: [];
};

type DocumentTeachingCandidateDraftTable = {
  Row: {
    brain_item_id: string;
    candidate_id: string;
    created_at: string;
    created_by: string;
  };
  Insert: {
    brain_item_id: string;
    candidate_id: string;
    created_at?: string;
    created_by: string;
  };
  Update: Partial<DocumentTeachingCandidateDraftTable["Insert"]>;
  Relationships: [];
};

/** Exact Task 21/22 Supabase contract layered onto the committed generated baseline. */
export type DocumentTeachingDatabase = Omit<BaseDatabase, "public"> & {
  public: Omit<BasePublic, "Tables" | "Functions"> & {
    Tables: BasePublic["Tables"] & {
      document_teaching_uploads: DocumentTeachingUploadTable;
      document_teaching_extractions: DocumentTeachingExtractionTable;
      document_teaching_candidates: DocumentTeachingCandidateTable;
      document_teaching_candidate_drafts: DocumentTeachingCandidateDraftTable;
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
      claim_document_teaching_extraction: {
        Args: {
          p_created_by: string;
          p_document_id: string;
          p_lease_seconds?: number;
          p_model: string;
          p_prompt_version?: number;
        };
        Returns: Array<{
          attempt_count: number;
          claim_state: string;
          claim_token: string | null;
          extraction_id: string | null;
        }>;
      };
      complete_document_teaching_extraction: {
        Args: {
          p_candidates: BaseDatabase["public"]["Tables"]["teaching_sources"]["Row"]["source_metadata"];
          p_claim_token: string;
          p_created_by: string;
          p_extraction_id: string;
        };
        Returns: boolean;
      };
      fail_document_teaching_extraction: {
        Args: {
          p_claim_token: string;
          p_created_by: string;
          p_error_code: string;
          p_extraction_id: string;
        };
        Returns: boolean;
      };
      create_document_teaching_drafts: {
        Args: {
          p_candidates: BaseDatabase["public"]["Tables"]["teaching_sources"]["Row"]["source_metadata"];
          p_created_by: string;
          p_extraction_id: string;
        };
        Returns: BaseDatabase["public"]["Tables"]["teaching_sources"]["Row"]["source_metadata"];
      };
    };
  };
};

/** Narrows the existing server-only admin client to the hosted Task 21/22 database contract. */
export function getDocumentTeachingAdminClient() {
  return getSupabaseAdminClient() as unknown as SupabaseClient<DocumentTeachingDatabase>;
}
