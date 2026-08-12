export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      business_dna: {
        Row: {
          audiences: string | null
          business_model: string | null
          business_name: string | null
          created_at: string
          delivery: string | null
          markets: string | null
          methodology: string | null
          niche: string | null
          offers: string | null
          positioning: string | null
          preferred_name: string | null
          price_ranges: string | null
          team_context: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audiences?: string | null
          business_model?: string | null
          business_name?: string | null
          created_at?: string
          delivery?: string | null
          markets?: string | null
          methodology?: string | null
          niche?: string | null
          offers?: string | null
          positioning?: string | null
          preferred_name?: string | null
          price_ranges?: string | null
          team_context?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audiences?: string | null
          business_model?: string | null
          business_name?: string | null
          created_at?: string
          delivery?: string | null
          markets?: string | null
          methodology?: string | null
          niche?: string | null
          offers?: string | null
          positioning?: string | null
          preferred_name?: string | null
          price_ranges?: string | null
          team_context?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          generation_lock_expires_at: string | null
          generation_lock_token: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          generation_lock_expires_at?: string | null
          generation_lock_token?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          generation_lock_expires_at?: string | null
          generation_lock_token?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      eslam_brain_items: {
        Row: {
          approved_version_number: number | null
          created_at: string
          created_by: string | null
          id: string
          item_type: string
          priority: number
          published_version_number: number | null
          semantic_layer: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_version_number?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_type: string
          priority?: number
          published_version_number?: number | null
          semantic_layer: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_version_number?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_type?: string
          priority?: number
          published_version_number?: number | null
          semantic_layer?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eslam_brain_items_approved_version_fk"
            columns: ["id", "approved_version_number"]
            isOneToOne: false
            referencedRelation: "eslam_brain_versions"
            referencedColumns: ["item_id", "version_number"]
          },
          {
            foreignKeyName: "eslam_brain_items_published_version_fk"
            columns: ["id", "published_version_number"]
            isOneToOne: false
            referencedRelation: "eslam_brain_versions"
            referencedColumns: ["item_id", "version_number"]
          },
        ]
      }
      eslam_brain_versions: {
        Row: {
          change_note: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          summary: string | null
          title: string
          topics: string[]
          version_number: number
        }
        Insert: {
          change_note?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          summary?: string | null
          title: string
          topics?: string[]
          version_number: number
        }
        Update: {
          change_note?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          summary?: string | null
          title?: string
          topics?: string[]
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "eslam_brain_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "eslam_brain_items"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_owner_fkey"
            columns: ["conversation_id", "user_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      teaching_items: {
        Row: {
          brain_item_id: string
          created_at: string
          created_by: string | null
          id: string
          source_id: string
        }
        Insert: {
          brain_item_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          source_id: string
        }
        Update: {
          brain_item_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_items_brain_item_id_fkey"
            columns: ["brain_item_id"]
            isOneToOne: false
            referencedRelation: "eslam_brain_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "teaching_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_sources: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          source_metadata: Json
          source_type: string
          source_uri: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          source_metadata?: Json
          source_type: string
          source_uri?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          source_metadata?: Json
          source_type?: string
          source_uri?: string | null
          title?: string
        }
        Relationships: []
      }
      teaching_versions: {
        Row: {
          brain_item_id: string
          created_at: string
          created_by: string | null
          id: string
          source_locator: Json
          teaching_item_id: string
          version_number: number
        }
        Insert: {
          brain_item_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          source_locator?: Json
          teaching_item_id: string
          version_number: number
        }
        Update: {
          brain_item_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source_locator?: Json
          teaching_item_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "teaching_versions_brain_version_fk"
            columns: ["brain_item_id", "version_number"]
            isOneToOne: false
            referencedRelation: "eslam_brain_versions"
            referencedColumns: ["item_id", "version_number"]
          },
          {
            foreignKeyName: "teaching_versions_teaching_item_brain_item_fk"
            columns: ["teaching_item_id", "brain_item_id"]
            isOneToOne: false
            referencedRelation: "teaching_items"
            referencedColumns: ["id", "brain_item_id"]
          },
        ]
      }
      voice_recordings: {
        Row: {
          created_at: string
          created_by: string
          duration_ms: number | null
          id: string
          mime_type: string
          size_bytes: number | null
          status: string
          storage_bucket: string
          storage_path: string
          uploaded_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          duration_ms?: number | null
          id?: string
          mime_type: string
          size_bytes?: number | null
          status?: string
          storage_bucket?: string
          storage_path: string
          uploaded_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          id?: string
          mime_type?: string
          size_bytes?: number | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string | null
        }
        Relationships: []
      }
      voice_teaching_candidate_drafts: {
        Row: {
          brain_item_id: string
          candidate_id: string
          created_at: string
          created_by: string
        }
        Insert: {
          brain_item_id: string
          candidate_id: string
          created_at?: string
          created_by: string
        }
        Update: {
          brain_item_id?: string
          candidate_id?: string
          created_at?: string
          created_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_teaching_candidate_drafts_brain_item_id_fkey"
            columns: ["brain_item_id"]
            isOneToOne: true
            referencedRelation: "eslam_brain_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_teaching_candidate_drafts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "voice_teaching_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_teaching_candidates: {
        Row: {
          content: string
          created_at: string
          created_by: string
          extraction_id: string
          id: string
          item_type: string
          ordinal: number
          priority: number
          semantic_layer: string
          source_excerpt: string
          summary: string | null
          title: string
          topics: string[]
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          extraction_id: string
          id?: string
          item_type: string
          ordinal: number
          priority: number
          semantic_layer: string
          source_excerpt: string
          summary?: string | null
          title: string
          topics?: string[]
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          extraction_id?: string
          id?: string
          item_type?: string
          ordinal?: number
          priority?: number
          semantic_layer?: string
          source_excerpt?: string
          summary?: string | null
          title?: string
          topics?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "voice_teaching_candidates_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: false
            referencedRelation: "voice_teaching_extractions"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_teaching_extractions: {
        Row: {
          attempt_count: number
          claim_token: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          last_error_at: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          model: string
          processing_started_at: string | null
          prompt_version: number
          status: string
          updated_at: string
          voice_recording_id: string
          voice_transcription_id: string
        }
        Insert: {
          attempt_count?: number
          claim_token?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          model: string
          processing_started_at?: string | null
          prompt_version?: number
          status: string
          updated_at?: string
          voice_recording_id: string
          voice_transcription_id: string
        }
        Update: {
          attempt_count?: number
          claim_token?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          model?: string
          processing_started_at?: string | null
          prompt_version?: number
          status?: string
          updated_at?: string
          voice_recording_id?: string
          voice_transcription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_teaching_extractions_voice_recording_id_fkey"
            columns: ["voice_recording_id"]
            isOneToOne: false
            referencedRelation: "voice_recordings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_teaching_extractions_voice_transcription_id_fkey"
            columns: ["voice_transcription_id"]
            isOneToOne: true
            referencedRelation: "voice_transcriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_transcriptions: {
        Row: {
          attempt_count: number
          claim_token: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          last_error_at: string | null
          last_error_code: string | null
          lease_expires_at: string | null
          model: string
          processing_started_at: string | null
          status: string
          transcript_text: string | null
          updated_at: string
          voice_recording_id: string
        }
        Insert: {
          attempt_count?: number
          claim_token?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          model: string
          processing_started_at?: string | null
          status: string
          transcript_text?: string | null
          updated_at?: string
          voice_recording_id: string
        }
        Update: {
          attempt_count?: number
          claim_token?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          lease_expires_at?: string | null
          model?: string
          processing_started_at?: string | null
          status?: string
          transcript_text?: string | null
          updated_at?: string
          voice_recording_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_transcriptions_voice_recording_id_fkey"
            columns: ["voice_recording_id"]
            isOneToOne: true
            referencedRelation: "voice_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_approve_eslam_brain_items: {
        Args: { p_created_by: string; p_item_ids: string[] }
        Returns: number
      }
      claim_conversation_generation: {
        Args: {
          p_conversation_id: string
          p_lock_seconds: number
          p_token: string
          p_user_id: string
        }
        Returns: boolean
      }
      claim_voice_teaching_extraction: {
        Args: {
          p_created_by: string
          p_lease_seconds?: number
          p_model: string
          p_prompt_version?: number
          p_transcription_id: string
        }
        Returns: {
          attempt_count: number
          claim_state: string
          claim_token: string
          extraction_id: string
        }[]
      }
      claim_voice_transcription: {
        Args: {
          p_created_by: string
          p_lease_seconds?: number
          p_model: string
          p_recording_id: string
        }
        Returns: {
          attempt_count: number
          claim_state: string
          claim_token: string
          transcript_text: string
          transcription_id: string
        }[]
      }
      complete_voice_teaching_extraction: {
        Args: {
          p_candidates: Json
          p_claim_token: string
          p_created_by: string
          p_extraction_id: string
        }
        Returns: boolean
      }
      complete_voice_transcription: {
        Args: {
          p_claim_token: string
          p_created_by: string
          p_transcript_text: string
          p_transcription_id: string
        }
        Returns: boolean
      }
      create_conversation_with_first_message: {
        Args: { p_content: string }
        Returns: string
      }
      create_eslam_brain_draft: { Args: { p_payload: Json }; Returns: string }
      create_eslam_brain_review_version: {
        Args: { p_payload: Json }
        Returns: number
      }
      create_voice_teaching_drafts: {
        Args: {
          p_candidates: Json
          p_created_by: string
          p_extraction_id: string
        }
        Returns: Json
      }
      fail_voice_teaching_extraction: {
        Args: {
          p_claim_token: string
          p_created_by: string
          p_error_code: string
          p_extraction_id: string
        }
        Returns: boolean
      }
      fail_voice_transcription: {
        Args: {
          p_claim_token: string
          p_created_by: string
          p_error_code: string
          p_transcription_id: string
        }
        Returns: boolean
      }
      publish_eslam_brain_draft_direct: {
        Args: {
          p_created_by: string
          p_item_id: string
          p_version_number: number
        }
        Returns: string
      }
      release_conversation_generation: {
        Args: { p_conversation_id: string; p_token: string; p_user_id: string }
        Returns: boolean
      }
      review_eslam_brain_item: {
        Args: {
          p_action: string
          p_created_by: string
          p_item_id: string
          p_version_number: number
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
