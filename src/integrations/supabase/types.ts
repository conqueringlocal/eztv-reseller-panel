export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      credit_logs: {
        Row: {
          action: Database["public"]["Enums"]["credit_action"]
          connections_used: number | null
          credits_used: number
          customer_id: string | null
          customer_name: string | null
          date: string
          id: string
          notes: string | null
          reseller_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["credit_action"]
          connections_used?: number | null
          credits_used: number
          customer_id?: string | null
          customer_name?: string | null
          date?: string
          id?: string
          notes?: string | null
          reseller_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["credit_action"]
          connections_used?: number | null
          credits_used?: number
          customer_id?: string | null
          customer_name?: string | null
          date?: string
          id?: string
          notes?: string | null
          reseller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_logs_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          cancelled_at: string | null
          connection_details: Json | null
          connection_list: Json | null
          connection_number: number | null
          connection_sequence: number | null
          created_at: string
          current_connections: number | null
          customer_group: string
          customer_group_id: string | null
          device_type: string
          email: string
          expiration_date: string
          highlevel_contact_id: string | null
          id: string
          is_deactivated: boolean | null
          is_trial: boolean | null
          m3u_url: string | null
          mac_address: string | null
          max_connections: number | null
          name: string
          password: string | null
          plan_duration: number
          provider: string | null
          reseller_id: string
          start_date: string
          status: string | null
          total_connections: number | null
          trial_created_at: string | null
          username: string | null
        }
        Insert: {
          cancelled_at?: string | null
          connection_details?: Json | null
          connection_list?: Json | null
          connection_number?: number | null
          connection_sequence?: number | null
          created_at?: string
          current_connections?: number | null
          customer_group: string
          customer_group_id?: string | null
          device_type: string
          email: string
          expiration_date: string
          highlevel_contact_id?: string | null
          id?: string
          is_deactivated?: boolean | null
          is_trial?: boolean | null
          m3u_url?: string | null
          mac_address?: string | null
          max_connections?: number | null
          name: string
          password?: string | null
          plan_duration: number
          provider?: string | null
          reseller_id: string
          start_date: string
          status?: string | null
          total_connections?: number | null
          trial_created_at?: string | null
          username?: string | null
        }
        Update: {
          cancelled_at?: string | null
          connection_details?: Json | null
          connection_list?: Json | null
          connection_number?: number | null
          connection_sequence?: number | null
          created_at?: string
          current_connections?: number | null
          customer_group?: string
          customer_group_id?: string | null
          device_type?: string
          email?: string
          expiration_date?: string
          highlevel_contact_id?: string | null
          id?: string
          is_deactivated?: boolean | null
          is_trial?: boolean | null
          m3u_url?: string | null
          mac_address?: string | null
          max_connections?: number | null
          name?: string
          password?: string | null
          plan_duration?: number
          provider?: string | null
          reseller_id?: string
          start_date?: string
          status?: string | null
          total_connections?: number | null
          trial_created_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_trial_limits: {
        Row: {
          created_at: string
          date: string
          id: string
          provider: string
          trial_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          provider: string
          trial_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          provider?: string
          trial_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          credits: number
          email: string
          id: string
          name: string
          parent_reseller_id: string | null
          provider: string | null
          reseller_level: number | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          credits?: number
          email: string
          id: string
          name: string
          parent_reseller_id?: string | null
          provider?: string | null
          reseller_level?: number | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          credits?: number
          email?: string
          id?: string
          name?: string
          parent_reseller_id?: string | null
          provider?: string | null
          reseller_level?: number | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_reseller_id_fkey"
            columns: ["parent_reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          reseller_id: string
          usage_count: number
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name: string
          reseller_id: string
          usage_count?: number
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          reseller_id?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "reseller_api_keys_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_highlevel_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location_api_key: string | null
          location_id: string
          reseller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_api_key?: string | null
          location_id: string
          reseller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location_api_key?: string | null
          location_id?: string
          reseller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_highlevel_settings_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_audit_logs: {
        Row: {
          action: string
          additional_data: Json | null
          created_at: string
          id: string
          ip_address: unknown | null
          reseller_id: string
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          additional_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown | null
          reseller_id: string
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          additional_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown | null
          reseller_id?: string
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_audit_logs_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sso_audit_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "sso_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          reseller_id: string
          revoked_at: string | null
          token_hash: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          reseller_id: string
          revoked_at?: string | null
          token_hash: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          reseller_id?: string
          revoked_at?: string | null
          token_hash?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sso_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sso_tokens_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          id: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_credits_required: {
        Args: { connections?: number; duration_months?: number }
        Returns: number
      }
      calculate_renewal_credits_required: {
        Args: { customer_id_param: string; duration_months: number }
        Returns: {
          credits_required: number
          accounts_count: number
          customer_group_name: string
        }[]
      }
      can_purchase_credits: {
        Args: { reseller_id: string }
        Returns: boolean
      }
      consolidate_customer_connections: {
        Args: { customer_group_name: string; reseller_id_param: string }
        Returns: {
          consolidated_customer_id: string
          total_connections: number
          connection_details: Json
        }[]
      }
      generate_api_key: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_sso_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_reseller_path: {
        Args: { reseller_id: string }
        Returns: {
          id: string
          name: string
          level: number
        }[]
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      renew_customer_group: {
        Args: {
          customer_id_param: string
          duration_months: number
          reseller_id_param: string
        }
        Returns: {
          success: boolean
          accounts_renewed: number
          credits_used: number
          error_message: string
        }[]
      }
      update_connection_count: {
        Args: { customer_id: string; connection_change?: number }
        Returns: boolean
      }
      validate_connection_limit: {
        Args: { customer_id: string; new_connections: number }
        Returns: boolean
      }
    }
    Enums: {
      credit_action: "deduction" | "addition" | "account_creation"
      user_role: "admin" | "reseller"
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
    Enums: {
      credit_action: ["deduction", "addition", "account_creation"],
      user_role: ["admin", "reseller"],
    },
  },
} as const
