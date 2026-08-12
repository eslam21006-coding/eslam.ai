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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_conversation_generation: {
        Args: {
          p_conversation_id: string
          p_lock_seconds: number
          p_token: string
          p_user_id: string
        }
        Returns: boolean
      }
      create_conversation_with_first_message: {
        Args: { p_content: string }
        Returns: string
      }
      create_eslam_brain_draft: { Args: { p_payload: Json }; Returns: string }
      release_conversation_generation: {
        Args: { p_conversation_id: string; p_token: string; p_user_id: string }
        Returns: boolean
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
