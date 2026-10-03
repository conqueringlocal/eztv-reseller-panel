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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      manual_credit_requests: {
        Row: { id:string; reseller_id:string; credits:number; unit_price:number; currency:string; payment_reference:string; status:string; verified_reference:string|null; reviewed_by:string|null; review_note:string|null; created_at:string; reviewed_at:string|null }
        Insert: never
        Update: never
        Relationships: []
      }

      admin_highlevel_settings: {
        Row: {
          created_at: string | null
          custom_field_mappings: Json | null
          id: string
          is_active: boolean
          location_id: string | null
          private_integration_token: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_field_mappings?: Json | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          private_integration_token?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_field_mappings?: Json | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          private_integration_token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      auth_rate_limits: {
        Row: {
          attempt_type: string
          attempts: number
          blocked_until: string | null
          created_at: string | null
          first_attempt: string | null
          id: string
          identifier: string
          last_attempt: string | null
        }
        Insert: {
          attempt_type: string
          attempts?: number
          blocked_until?: string | null
          created_at?: string | null
          first_attempt?: string | null
          id?: string
          identifier: string
          last_attempt?: string | null
        }
        Update: {
          attempt_type?: string
          attempts?: number
          blocked_until?: string | null
          created_at?: string | null
          first_attempt?: string | null
          id?: string
          identifier?: string
          last_attempt?: string | null
        }
        Relationships: []
      }
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
          revenue_amount: number | null
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
          revenue_amount?: number | null
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
          revenue_amount?: number | null
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
      credit_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          credits_requested: number
          id: string
          message: string | null
          parent_reseller_id: string
          price_per_credit: number
          processed_at: string | null
          requester_id: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          credits_requested: number
          id?: string
          message?: string | null
          parent_reseller_id: string
          price_per_credit: number
          processed_at?: string | null
          requester_id: string
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          credits_requested?: number
          id?: string
          message?: string | null
          parent_reseller_id?: string
          price_per_credit?: number
          processed_at?: string | null
          requester_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_requests_parent_reseller_id_fkey"
            columns: ["parent_reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_requests_requester_id_fkey"
            columns: ["requester_id"]
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
          package_id: string | null
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
          package_id?: string | null
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
          package_id?: string | null
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
      funnel_leads: {
        Row: {
          additional_data: Json | null
          created_at: string
          email: string
          funnel_id: string
          id: string
          ip_address: unknown
          name: string
          phone: string | null
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          additional_data?: Json | null
          created_at?: string
          email: string
          funnel_id: string
          id?: string
          ip_address?: unknown
          name: string
          phone?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          additional_data?: Json | null
          created_at?: string
          email?: string
          funnel_id?: string
          id?: string
          ip_address?: unknown
          name?: string
          phone?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_leads_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_templates: {
        Row: {
          created_at: string
          created_by: string | null
          css_content: string | null
          description: string | null
          form_fields: Json | null
          html_content: string
          id: string
          integrations: Json | null
          is_active: boolean
          js_content: string | null
          name: string
          preview_image_url: string | null
          template_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          css_content?: string | null
          description?: string | null
          form_fields?: Json | null
          html_content: string
          id?: string
          integrations?: Json | null
          is_active?: boolean
          js_content?: string | null
          name: string
          preview_image_url?: string | null
          template_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          css_content?: string | null
          description?: string | null
          form_fields?: Json | null
          html_content?: string
          id?: string
          integrations?: Json | null
          is_active?: boolean
          js_content?: string | null
          name?: string
          preview_image_url?: string | null
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      funnels: {
        Row: {
          analytics: Json | null
          created_at: string
          css_content: string | null
          custom_domain: string | null
          form_fields: Json | null
          html_content: string
          id: string
          integrations: Json | null
          is_published: boolean
          js_content: string | null
          name: string
          reseller_id: string
          subdomain: string
          template_id: string
          updated_at: string
        }
        Insert: {
          analytics?: Json | null
          created_at?: string
          css_content?: string | null
          custom_domain?: string | null
          form_fields?: Json | null
          html_content: string
          id?: string
          integrations?: Json | null
          is_published?: boolean
          js_content?: string | null
          name: string
          reseller_id: string
          subdomain: string
          template_id: string
          updated_at?: string
        }
        Update: {
          analytics?: Json | null
          created_at?: string
          css_content?: string | null
          custom_domain?: string | null
          form_fields?: Json | null
          html_content?: string
          id?: string
          integrations?: Json | null
          is_published?: boolean
          js_content?: string | null
          name?: string
          reseller_id?: string
          subdomain?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnels_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "funnel_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_revenue_summary: {
        Row: {
          average_sale_amount: number
          created_at: string
          credit_sales_count: number
          id: string
          month_year: string
          total_revenue: number
          updated_at: string
        }
        Insert: {
          average_sale_amount?: number
          created_at?: string
          credit_sales_count?: number
          id?: string
          month_year: string
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          average_sale_amount?: number
          created_at?: string
          credit_sales_count?: number
          id?: string
          month_year?: string
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_highlevel_contact_id: string | null
          api_key: string | null
          created_at: string
          credit_price_per_unit: number | null
          credit_purchase_enabled: boolean | null
          credits: number
          email: string
          id: string
          last_low_credit_alert_at: string | null
          low_credit_alert_cooldown_hours: number
          low_credit_threshold: number
          name: string
          panel_url: string | null
          parent_reseller_id: string | null
          provider: string | null
          reseller_level: number | null
          role: Database["public"]["Enums"]["user_role"]
          use_admin_api: boolean | null
        }
        Insert: {
          admin_highlevel_contact_id?: string | null
          api_key?: string | null
          created_at?: string
          credit_price_per_unit?: number | null
          credit_purchase_enabled?: boolean | null
          credits?: number
          email: string
          id: string
          last_low_credit_alert_at?: string | null
          low_credit_alert_cooldown_hours?: number
          low_credit_threshold?: number
          name: string
          panel_url?: string | null
          parent_reseller_id?: string | null
          provider?: string | null
          reseller_level?: number | null
          role?: Database["public"]["Enums"]["user_role"]
          use_admin_api?: boolean | null
        }
        Update: {
          admin_highlevel_contact_id?: string | null
          api_key?: string | null
          created_at?: string
          credit_price_per_unit?: number | null
          credit_purchase_enabled?: boolean | null
          credits?: number
          email?: string
          id?: string
          last_low_credit_alert_at?: string | null
          low_credit_alert_cooldown_hours?: number
          low_credit_threshold?: number
          name?: string
          panel_url?: string | null
          parent_reseller_id?: string | null
          provider?: string | null
          reseller_level?: number | null
          role?: Database["public"]["Enums"]["user_role"]
          use_admin_api?: boolean | null
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
      renewal_transactions: {
        Row: {
          api_calls_completed: boolean | null
          completed_at: string | null
          created_at: string
          credits_required: number
          customer_id: string
          id: string
          metadata: Json | null
          plan_duration: number
          reseller_id: string
          rollback_reason: string | null
          status: string
          transaction_key: string
        }
        Insert: {
          api_calls_completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          credits_required: number
          customer_id: string
          id?: string
          metadata?: Json | null
          plan_duration: number
          reseller_id: string
          rollback_reason?: string | null
          status?: string
          transaction_key: string
        }
        Update: {
          api_calls_completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          credits_required?: number
          customer_id?: string
          id?: string
          metadata?: Json | null
          plan_duration?: number
          reseller_id?: string
          rollback_reason?: string | null
          status?: string
          transaction_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          custom_field_mappings: Json | null
          id: string
          is_active: boolean
          location_api_key: string | null
          location_id: string
          private_integration_token: string | null
          reseller_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_field_mappings?: Json | null
          id?: string
          is_active?: boolean
          location_api_key?: string | null
          location_id: string
          private_integration_token?: string | null
          reseller_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_field_mappings?: Json | null
          id?: string
          is_active?: boolean
          location_api_key?: string | null
          location_id?: string
          private_integration_token?: string | null
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
      security_audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown
          resource_id: string | null
          resource_type: string
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_dashboard_metrics: {
        Row: {
          description: string
          last_updated: string | null
          metric_name: string
          metric_value: string
        }
        Insert: {
          description: string
          last_updated?: string | null
          metric_name: string
          metric_value: string
        }
        Update: {
          description?: string
          last_updated?: string | null
          metric_name?: string
          metric_value?: string
        }
        Relationships: []
      }
      sports_ppv_updates: {
        Row: {
          channel_info: Json | null
          content: string
          created_at: string
          game_date: string
          id: string
          posted_to_highlevel: boolean | null
          sport_category: string
          telegram_message_id: string | null
          updated_at: string
        }
        Insert: {
          channel_info?: Json | null
          content: string
          created_at?: string
          game_date: string
          id?: string
          posted_to_highlevel?: boolean | null
          sport_category: string
          telegram_message_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_info?: Json | null
          content?: string
          created_at?: string
          game_date?: string
          id?: string
          posted_to_highlevel?: boolean | null
          sport_category?: string
          telegram_message_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sso_audit_logs: {
        Row: {
          action: string
          additional_data: Json | null
          created_at: string
          id: string
          ip_address: unknown
          reseller_id: string
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          additional_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
          reseller_id: string
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          additional_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
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
          expires_at: string
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
          expires_at?: string
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
          expires_at?: string
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
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      reseller_highlevel_status: {
        Row: {
          created_at: string | null
          is_active: boolean | null
          is_connected: boolean | null
          location_id: string | null
          reseller_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          is_active?: boolean | null
          is_connected?: never
          location_id?: string | null
          reseller_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          is_active?: boolean | null
          is_connected?: never
          location_id?: string | null
          reseller_id?: string | null
          updated_at?: string | null
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
    }
    Functions: {
      get_sales_workspace: { Args: Record<PropertyKey, never>; Returns: Json }
      get_sales_program_summary: { Args: Record<PropertyKey, never>; Returns: Json }
      save_sales_lead: { Args: {p_id:string;p_revision:number;p_command:string;p_data:Json}; Returns:string }
      record_sales_contact: { Args: {p_id:string;p_lead:string;p_note:string;p_minutes:number;p_next:string|null}; Returns:undefined }
      import_sales_trial: { Args: {p_customer:string}; Returns:string }
      save_sales_page: { Args: {p_revision:number;p_data:Json}; Returns:undefined }
      create_sales_referral: { Args: {p_customer:string;p_label:string}; Returns:string }
      set_sales_referral_enabled: { Args: {p_id:string;p_enabled:boolean}; Returns:undefined }
      record_sales_reward: { Args: {p_lead:string;p_credits:number;p_cash:number;p_reference:string;p_note:string}; Returns:undefined }
      get_public_sales_page: { Args: {p_slug:string}; Returns:Json }

      get_business_dashboard: { Args: { p_month: string }; Returns: Json }
      get_renewal_worklist: { Args: Record<PropertyKey, never>; Returns: Json }
      record_business_entry: { Args: { p_id: string; p_kind: string; p_date: string; p_amount: number; p_credits: number; p_reseller: string | null; p_reference: string; p_note: string; p_sale?: string | null }; Returns: string }
      void_business_entry: { Args: { p_id: string; p_reason: string }; Returns: undefined }
      record_provider_balance: { Args: { p_id: string; p_credits: number; p_checked_at: string; p_note: string }; Returns: string }

      get_operation_review_queue: {Args:never;Returns:Json}
      adjust_reseller_credits: { Args: {p_id:string;p_reseller:string;p_delta:number;p_notes:string}; Returns:number }
      request_manual_credits: { Args: {p_id:string;p_credits:number;p_reference:string}; Returns:string }
      review_manual_credits: { Args: {p_id:string;p_approve:boolean;p_verified_reference:string;p_note:string}; Returns:string }
      request_parent_credits: { Args: {p_credits:number;p_message:string}; Returns:string }
      review_parent_credits: { Args: {p_id:string;p_approve:boolean}; Returns:string }

      calculate_credits_required: {
        Args: { connections?: number; duration_months?: number }
        Returns: number
      }
      calculate_mrr_projections: {
        Args: never
        Returns: {
          avg_sale_amount: number
          current_month_revenue: number
          growth_rate: number
          projected_mrr: number
          total_sales_count: number
        }[]
      }
      calculate_renewal_credits_required: {
        Args: { customer_id_param: string; duration_months: number }
        Returns: {
          accounts_count: number
          credits_required: number
          customer_group_name: string
        }[]
      }
      can_purchase_credits: { Args: { reseller_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: {
          p_attempt_type: string
          p_identifier: string
          p_max_attempts?: number
          p_window_minutes?: number
        }
        Returns: boolean
      }
      complete_renewal_transaction: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
      consolidate_customer_connections: {
        Args: { customer_group_name: string; reseller_id_param: string }
        Returns: {
          connection_details: Json
          consolidated_customer_id: string
          total_connections: number
        }[]
      }
      detect_duplicate_customers: {
        Args: { p_reseller_id?: string }
        Returns: {
          customer1_email: string
          customer1_id: string
          customer1_name: string
          customer2_email: string
          customer2_id: string
          customer2_name: string
          match_type: string
        }[]
      }
      detect_duplicate_renewals: {
        Args: { p_hours_back?: number }
        Returns: {
          customer_id: string
          customer_name: string
          duplicate_count: number
          log_ids: string[]
          reseller_id: string
          total_excess_credits: number
        }[]
      }
      fail_renewal_transaction: {
        Args: { p_reason?: string; p_transaction_id: string }
        Returns: boolean
      }
      generate_api_key: { Args: never; Returns: string }
      generate_renewal_transaction_key: {
        Args: {
          p_customer_id: string
          p_plan_duration: number
          p_time_window_minutes?: number
        }
        Returns: string
      }
      generate_sso_token: { Args: never; Returns: string }
      get_current_user_role: { Args: never; Returns: string }
      get_earliest_expiration: {
        Args: { connection_list_param: Json }
        Returns: string
      }
      get_highlevel_status: {
        Args: { p_reseller_id: string }
        Returns: {
          is_active: boolean
          is_connected: boolean
          location_id: string
          reseller_id: string
        }[]
      }
      get_or_create_renewal_transaction: {
        Args: {
          p_credits_required: number
          p_customer_id: string
          p_plan_duration: number
          p_reseller_id: string
        }
        Returns: {
          api_calls_completed: boolean
          current_status: string
          is_new_transaction: boolean
          transaction_id: string
        }[]
      }
      get_reseller_path: {
        Args: { reseller_id: string }
        Returns: {
          id: string
          level: number
          name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      log_security_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id?: string
          p_resource_type: string
          p_success?: boolean
        }
        Returns: undefined
      }
      refresh_security_dashboard: { Args: never; Returns: undefined }
      refund_duplicate_charges: {
        Args: {
          p_credits_to_refund: number
          p_reason: string
          p_reseller_id: string
        }
        Returns: boolean
      }
      renew_customer_group: {
        Args: {
          customer_id_param: string
          duration_months: number
          reseller_id_param: string
        }
        Returns: {
          accounts_renewed: number
          credits_used: number
          error_message: string
          success: boolean
        }[]
      }
      transfer_credits_to_sub_reseller: {
        Args: {
          credits_to_transfer: number
          notes_param?: string
          parent_reseller_id_param: string
          sub_reseller_id_param: string
        }
        Returns: {
          error_message: string
          new_balance: number
          success: boolean
        }[]
      }
      update_connection_count: {
        Args: { connection_change?: number; customer_id: string }
        Returns: boolean
      }
      validate_connection_limit: {
        Args: { customer_id: string; new_connections: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "reseller"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "reseller"],
      credit_action: ["deduction", "addition", "account_creation"],
      user_role: ["admin", "reseller"],
    },
  },
} as const
