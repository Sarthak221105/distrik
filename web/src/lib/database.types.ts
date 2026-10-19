export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_actions: {
        Row: {
          action_type: string
          agent: string
          conversation_id: string | null
          created_at: string
          flag_reason: string | null
          flagged: boolean
          flagged_by: string | null
          id: string
          input: Json | null
          latency_ms: number | null
          manufacturer_id: string | null
          model: string | null
          outcome: string | null
          output: Json | null
          prompt_version: number | null
          prospect_id: string | null
          rule_checked: string | null
          turn_id: string | null
        }
        Insert: {
          action_type: string
          agent: string
          conversation_id?: string | null
          created_at?: string
          flag_reason?: string | null
          flagged?: boolean
          flagged_by?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          manufacturer_id?: string | null
          model?: string | null
          outcome?: string | null
          output?: Json | null
          prompt_version?: number | null
          prospect_id?: string | null
          rule_checked?: string | null
          turn_id?: string | null
        }
        Update: {
          action_type?: string
          agent?: string
          conversation_id?: string | null
          created_at?: string
          flag_reason?: string | null
          flagged?: boolean
          flagged_by?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          manufacturer_id?: string | null
          model?: string | null
          outcome?: string | null
          output?: Json | null
          prompt_version?: number | null
          prospect_id?: string | null
          rule_checked?: string | null
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "ai_actions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_turns: {
        Row: {
          attempts: number
          completed_at: string | null
          context: Json
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          manufacturer_id: string
          reason: string
          status: string
          trigger_message_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          context?: Json
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          manufacturer_id: string
          reason?: string
          status?: string
          trigger_message_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          context?: Json
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          manufacturer_id?: string
          reason?: string
          status?: string
          trigger_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_turns_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_turns_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_turns_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "ai_turns_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          details: Json
          entity: string | null
          entity_id: string | null
          id: number
          manufacturer_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: never
          manufacturer_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: never
          manufacturer_id?: string | null
        }
        Relationships: []
      }
      autonomy_policies: {
        Row: {
          action_type: string
          description: string | null
          id: string
          manufacturer_id: string
          threshold_paise: number | null
          tier: Database["public"]["Enums"]["autonomy_tier"]
          updated_at: string
        }
        Insert: {
          action_type: string
          description?: string | null
          id?: string
          manufacturer_id: string
          threshold_paise?: number | null
          tier: Database["public"]["Enums"]["autonomy_tier"]
          updated_at?: string
        }
        Update: {
          action_type?: string
          description?: string | null
          id?: string
          manufacturer_id?: string
          threshold_paise?: number | null
          tier?: Database["public"]["Enums"]["autonomy_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_policies_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomy_policies_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      calls: {
        Row: {
          created_at: string
          direction: string
          extracted_fields: Json | null
          id: string
          manufacturer_id: string
          prospect_id: string
          recording_path: string | null
          transcript: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          extracted_fields?: Json | null
          id?: string
          manufacturer_id: string
          prospect_id: string
          recording_path?: string | null
          transcript?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          extracted_fields?: Json | null
          id?: string
          manufacturer_id?: string
          prospect_id?: string
          recording_path?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "calls_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_jobs: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          manufacturer_id: string
          records: number
          source_id: string | null
          started_at: string | null
          status: string
          step: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          manufacturer_id: string
          records?: number
          source_id?: string | null
          started_at?: string | null
          status?: string
          step: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          manufacturer_id?: string
          records?: number
          source_id?: string | null
          started_at?: string | null
          status?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_jobs_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_jobs_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "campaign_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          discovery_completed_at: string | null
          id: string
          launched_at: string | null
          manufacturer_id: string
          name: string
          objective_text: string
          parsed_intent: Json
          product_ids: string[]
          ready_at: string | null
          stalled_step: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          status_detail: string | null
          target_category: string | null
          target_city: string | null
          target_count: number
          target_geo: Json
          target_state: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discovery_completed_at?: string | null
          id?: string
          launched_at?: string | null
          manufacturer_id: string
          name: string
          objective_text: string
          parsed_intent?: Json
          product_ids?: string[]
          ready_at?: string | null
          stalled_step?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          status_detail?: string | null
          target_category?: string | null
          target_city?: string | null
          target_count?: number
          target_geo?: Json
          target_state?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discovery_completed_at?: string | null
          id?: string
          launched_at?: string | null
          manufacturer_id?: string
          name?: string
          objective_text?: string
          parsed_intent?: Json
          product_ids?: string[]
          ready_at?: string | null
          stalled_step?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          status_detail?: string | null
          target_category?: string | null
          target_city?: string | null
          target_count?: number
          target_geo?: Json
          target_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      consent_events: {
        Row: {
          channel: Database["public"]["Enums"]["channel"]
          contact_id: string
          created_at: string
          evidence: Json | null
          from_status: Database["public"]["Enums"]["consent_status"] | null
          id: number
          manufacturer_id: string
          source: string | null
          to_status: Database["public"]["Enums"]["consent_status"]
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel"]
          contact_id: string
          created_at?: string
          evidence?: Json | null
          from_status?: Database["public"]["Enums"]["consent_status"] | null
          id?: never
          manufacturer_id: string
          source?: string | null
          to_status: Database["public"]["Enums"]["consent_status"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel"]
          contact_id?: string
          created_at?: string
          evidence?: Json | null
          from_status?: Database["public"]["Enums"]["consent_status"] | null
          id?: never
          manufacturer_id?: string
          source?: string | null
          to_status?: Database["public"]["Enums"]["consent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          changed_at: string
          changed_by: string | null
          channel: Database["public"]["Enums"]["channel"]
          contact_id: string
          evidence: Json
          id: string
          manufacturer_id: string
          source: string | null
          status: Database["public"]["Enums"]["consent_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          channel?: Database["public"]["Enums"]["channel"]
          contact_id: string
          evidence?: Json
          id?: string
          manufacturer_id: string
          source?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          channel?: Database["public"]["Enums"]["channel"]
          contact_id?: string
          evidence?: Json
          id?: string
          manufacturer_id?: string
          source?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          erased_at: string | null
          id: string
          is_primary: boolean
          manufacturer_id: string
          name: string | null
          phone_e164: string | null
          prospect_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          erased_at?: string | null
          id?: string
          is_primary?: boolean
          manufacturer_id: string
          name?: string | null
          phone_e164?: string | null
          prospect_id: string
          role?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          erased_at?: string | null
          id?: string
          is_primary?: boolean
          manufacturer_id?: string
          name?: string | null
          phone_e164?: string | null
          prospect_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "contacts_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused: boolean
          channel: Database["public"]["Enums"]["channel"]
          contact_id: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_preview: string | null
          last_outbound_at: string | null
          manufacturer_id: string
          paused_at: string | null
          paused_by: string | null
          paused_reason: string | null
          prospect_id: string
          unread_count: number
          window_expires_at: string | null
        }
        Insert: {
          ai_paused?: boolean
          channel?: Database["public"]["Enums"]["channel"]
          contact_id: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          manufacturer_id: string
          paused_at?: string | null
          paused_by?: string | null
          paused_reason?: string | null
          prospect_id: string
          unread_count?: number
          window_expires_at?: string | null
        }
        Update: {
          ai_paused?: boolean
          channel?: Database["public"]["Enums"]["channel"]
          contact_id?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          manufacturer_id?: string
          paused_at?: string | null
          paused_by?: string | null
          paused_reason?: string | null
          prospect_id?: string
          unread_count?: number
          window_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "conversations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rules: {
        Row: {
          created_at: string
          floor_price_paise: number
          hard_minimum_paise: number
          id: string
          manufacturer_id: string
          max_credit_paise: number | null
          max_discount_pct: number | null
          payment_terms: string | null
          product_id: string
          qty_from: number
        }
        Insert: {
          created_at?: string
          floor_price_paise: number
          hard_minimum_paise: number
          id?: string
          manufacturer_id: string
          max_credit_paise?: number | null
          max_discount_pct?: number | null
          payment_terms?: string | null
          product_id: string
          qty_from: number
        }
        Update: {
          created_at?: string
          floor_price_paise?: number
          hard_minimum_paise?: number
          id?: string
          manufacturer_id?: string
          max_credit_paise?: number | null
          max_discount_pct?: number | null
          payment_terms?: string | null
          product_id?: string
          qty_from?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_rules_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_rules_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "discount_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          approved_for_sharing: boolean
          created_at: string
          created_by: string | null
          error: string | null
          extracted: Json | null
          id: string
          kind: string
          manufacturer_id: string
          mime_type: string | null
          product_id: string | null
          status: string
          storage_path: string
          title: string | null
        }
        Insert: {
          approved_for_sharing?: boolean
          created_at?: string
          created_by?: string | null
          error?: string | null
          extracted?: Json | null
          id?: string
          kind?: string
          manufacturer_id: string
          mime_type?: string | null
          product_id?: string | null
          status?: string
          storage_path: string
          title?: string | null
        }
        Update: {
          approved_for_sharing?: boolean
          created_at?: string
          created_by?: string | null
          error?: string | null
          extracted?: Json | null
          id?: string
          kind?: string
          manufacturer_id?: string
          mime_type?: string | null
          product_id?: string | null
          status?: string
          storage_path?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "documents_product_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          attempt: number
          conversation_id: string
          created_at: string
          created_by: string
          due_at: string
          id: string
          manufacturer_id: string
          reason: string
          status: Database["public"]["Enums"]["followup_status"]
        }
        Insert: {
          attempt?: number
          conversation_id: string
          created_at?: string
          created_by?: string
          due_at: string
          id?: string
          manufacturer_id: string
          reason: string
          status?: Database["public"]["Enums"]["followup_status"]
        }
        Update: {
          attempt?: number
          conversation_id?: string
          created_at?: string
          created_by?: string
          due_at?: string
          id?: string
          manufacturer_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["followup_status"]
        }
        Relationships: [
          {
            foreignKeyName: "followups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      human_approvals: {
        Row: {
          ai_recommendation: string | null
          approved_price_paise: number | null
          context: Json
          conversation_id: string | null
          counter_paise: number | null
          created_at: string
          deal_value_paise: number | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          expires_at: string
          hard_minimum_paise: number | null
          id: string
          kind: Database["public"]["Enums"]["approval_kind"]
          manufacturer_id: string
          negotiation_id: string | null
          permitted_paise: number | null
          prospect_id: string | null
          qty: number | null
          quotation_id: string | null
          reminder_sent_at: string | null
          requested_paise: number | null
          status: Database["public"]["Enums"]["approval_status"]
          summary: string | null
        }
        Insert: {
          ai_recommendation?: string | null
          approved_price_paise?: number | null
          context?: Json
          conversation_id?: string | null
          counter_paise?: number | null
          created_at?: string
          deal_value_paise?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at: string
          hard_minimum_paise?: number | null
          id?: string
          kind: Database["public"]["Enums"]["approval_kind"]
          manufacturer_id: string
          negotiation_id?: string | null
          permitted_paise?: number | null
          prospect_id?: string | null
          qty?: number | null
          quotation_id?: string | null
          reminder_sent_at?: string | null
          requested_paise?: number | null
          status?: Database["public"]["Enums"]["approval_status"]
          summary?: string | null
        }
        Update: {
          ai_recommendation?: string | null
          approved_price_paise?: number | null
          context?: Json
          conversation_id?: string | null
          counter_paise?: number | null
          created_at?: string
          deal_value_paise?: number | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          expires_at?: string
          hard_minimum_paise?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["approval_kind"]
          manufacturer_id?: string
          negotiation_id?: string | null
          permitted_paise?: number | null
          prospect_id?: string | null
          qty?: number | null
          quotation_id?: string | null
          reminder_sent_at?: string | null
          requested_paise?: number | null
          status?: Database["public"]["Enums"]["approval_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "human_approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_approvals_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_approvals_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "human_approvals_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_approvals_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "human_approvals_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          result: Json | null
          rpc: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          key: string
          result?: Json | null
          rpc: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          result?: Json | null
          rpc?: string
          user_id?: string | null
        }
        Relationships: []
      }
      india_states: {
        Row: {
          alt_names: string[]
          code: string
          name: string
        }
        Insert: {
          alt_names?: string[]
          code: string
          name: string
        }
        Update: {
          alt_names?: string[]
          code?: string
          name?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string
          document_id: string | null
          embedding: string | null
          id: string
          manufacturer_id: string
          metadata: Json
          product_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          manufacturer_id: string
          metadata?: Json
          product_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          id?: string
          manufacturer_id?: string
          metadata?: Json
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "knowledge_chunks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          fit_config_version: number
          fit_weights: Json
          gstin: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          name: string
          order_seq: number
          phone: string | null
          quote_prefix: string
          quote_seq: number
          settings: Json
          state: string
          state_code: string | null
          whatsapp_display_number: string | null
          whatsapp_phone_number_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          fit_config_version?: number
          fit_weights?: Json
          gstin?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name: string
          order_seq?: number
          phone?: string | null
          quote_prefix?: string
          quote_seq?: number
          settings?: Json
          state: string
          state_code?: string | null
          whatsapp_display_number?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          fit_config_version?: number
          fit_weights?: Json
          gstin?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          order_seq?: number
          phone?: string | null
          quote_prefix?: string
          quote_seq?: number
          settings?: Json
          state?: string
          state_code?: string | null
          whatsapp_display_number?: string | null
          whatsapp_phone_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manufacturers_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "india_states"
            referencedColumns: ["code"]
          },
        ]
      }
      merge_candidates: {
        Row: {
          campaign_id: string | null
          candidate_prospect_id: string | null
          created_at: string
          decision_note: string | null
          id: string
          manufacturer_id: string
          prospect_id: string
          raw_record_id: string
          resolved_at: string | null
          resolved_by: string | null
          similarity: number
          status: string
        }
        Insert: {
          campaign_id?: string | null
          candidate_prospect_id?: string | null
          created_at?: string
          decision_note?: string | null
          id?: string
          manufacturer_id: string
          prospect_id: string
          raw_record_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          similarity: number
          status?: string
        }
        Update: {
          campaign_id?: string | null
          candidate_prospect_id?: string | null
          created_at?: string
          decision_note?: string | null
          id?: string
          manufacturer_id?: string
          prospect_id?: string
          raw_record_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          similarity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "merge_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_candidate_prospect_id_fkey"
            columns: ["candidate_prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "merge_candidates_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_raw_record_id_fkey"
            columns: ["raw_record_id"]
            isOneToOne: false
            referencedRelation: "raw_records"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          language: string
          manufacturer_id: string | null
          meta_status: Database["public"]["Enums"]["template_status"]
          meta_template_id: string | null
          name: string
          purpose: string | null
          rejection_reason: string | null
          usage_count: number
          variables: string[]
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          manufacturer_id?: string | null
          meta_status?: Database["public"]["Enums"]["template_status"]
          meta_template_id?: string | null
          name: string
          purpose?: string | null
          rejection_reason?: string | null
          usage_count?: number
          variables?: string[]
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          manufacturer_id?: string | null
          meta_status?: Database["public"]["Enums"]["template_status"]
          meta_template_id?: string | null
          name?: string
          purpose?: string | null
          rejection_reason?: string | null
          usage_count?: number
          variables?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      messages: {
        Row: {
          actor: Database["public"]["Enums"]["message_actor"]
          actor_user_id: string | null
          ai_action_id: string | null
          attempts: number
          body: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          manufacturer_id: string
          media_filename: string | null
          media_mime: string | null
          media_path: string | null
          media_type: string | null
          provider_message_id: string | null
          read_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          template_id: string | null
          template_params: Json | null
          turn_id: string | null
        }
        Insert: {
          actor: Database["public"]["Enums"]["message_actor"]
          actor_user_id?: string | null
          ai_action_id?: string | null
          attempts?: number
          body?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          manufacturer_id: string
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_type?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status: Database["public"]["Enums"]["message_status"]
          template_id?: string | null
          template_params?: Json | null
          turn_id?: string | null
        }
        Update: {
          actor?: Database["public"]["Enums"]["message_actor"]
          actor_user_id?: string | null
          ai_action_id?: string | null
          attempts?: number
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          manufacturer_id?: string
          media_filename?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_type?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          template_id?: string | null
          template_params?: Json | null
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_offers: {
        Row: {
          by_party: string
          counter_paise: number | null
          created_at: string
          decision: Database["public"]["Enums"]["offer_decision"]
          id: string
          manufacturer_id: string
          negotiation_id: string
          price_paise: number
          qty: number
          rule_snapshot: Json
          turn_id: string | null
        }
        Insert: {
          by_party: string
          counter_paise?: number | null
          created_at?: string
          decision: Database["public"]["Enums"]["offer_decision"]
          id?: string
          manufacturer_id: string
          negotiation_id: string
          price_paise: number
          qty: number
          rule_snapshot?: Json
          turn_id?: string | null
        }
        Update: {
          by_party?: string
          counter_paise?: number | null
          created_at?: string
          decision?: Database["public"]["Enums"]["offer_decision"]
          id?: string
          manufacturer_id?: string
          negotiation_id?: string
          price_paise?: number
          qty?: number
          rule_snapshot?: Json
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_offers_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_offers_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "negotiation_offers_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiations: {
        Row: {
          agreed_price_paise: number | null
          conversation_id: string | null
          created_at: string
          id: string
          last_floor_paise: number | null
          manufacturer_id: string
          payment_terms: string | null
          product_id: string
          prospect_id: string
          qty: number
          status: Database["public"]["Enums"]["negotiation_status"]
          updated_at: string
        }
        Insert: {
          agreed_price_paise?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          last_floor_paise?: number | null
          manufacturer_id: string
          payment_terms?: string | null
          product_id: string
          prospect_id: string
          qty: number
          status?: Database["public"]["Enums"]["negotiation_status"]
          updated_at?: string
        }
        Update: {
          agreed_price_paise?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          last_floor_paise?: number | null
          manufacturer_id?: string
          payment_terms?: string | null
          product_id?: string
          prospect_id?: string
          qty?: number
          status?: Database["public"]["Enums"]["negotiation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiations_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiations_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "negotiations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channels: string[]
          created_at: string
          data: Json
          dedupe_key: string | null
          emailed_at: string | null
          id: string
          kind: string
          link: string | null
          manufacturer_id: string | null
          pushed_at: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channels?: string[]
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          emailed_at?: string | null
          id?: string
          kind: string
          link?: string | null
          manufacturer_id?: string | null
          pushed_at?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          channels?: string[]
          created_at?: string
          data?: Json
          dedupe_key?: string | null
          emailed_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          manufacturer_id?: string | null
          pushed_at?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          line_total_paise: number
          manufacturer_id: string
          order_id: string
          product_id: string
          qty: number
          tax_paise: number
          unit_price_paise: number
        }
        Insert: {
          id?: string
          line_total_paise: number
          manufacturer_id: string
          order_id: string
          product_id: string
          qty: number
          tax_paise?: number
          unit_price_paise: number
        }
        Update: {
          id?: string
          line_total_paise?: number
          manufacturer_id?: string
          order_id?: string
          product_id?: string
          qty?: number
          tax_paise?: number
          unit_price_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          manufacturer_id: string
          number: string
          ordered_on: string
          override_reason: string | null
          po_id: string | null
          prospect_id: string
          quotation_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_paise: number
        }
        Insert: {
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          manufacturer_id: string
          number: string
          ordered_on?: string
          override_reason?: string | null
          po_id?: string | null
          prospect_id: string
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_paise: number
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          manufacturer_id?: string
          number?: string
          ordered_on?: string
          override_reason?: string | null
          po_id?: string | null
          prospect_id?: string
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "orders_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: true
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paise: number
          due_date: string | null
          id: string
          manufacturer_id: string
          order_id: string
          paid_at: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_paise: number
          due_date?: string | null
          id?: string
          manufacturer_id: string
          order_id: string
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_paise?: number
          due_date?: string | null
          id?: string
          manufacturer_id?: string
          order_id?: string
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          created_at: string
          id: number
          manufacturer_id: string | null
          name: string
          properties: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          manufacturer_id?: string | null
          name: string
          properties?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          manufacturer_id?: string | null
          name?: string
          properties?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_events_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_events_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          certifications: string[]
          cost_paise: number | null
          created_at: string
          description: string | null
          distributor_price_paise: number | null
          gst_rate: number
          hsn_code: string | null
          id: string
          image_paths: string[]
          manufacturer_id: string
          moq: number
          mrp_paise: number | null
          name: string
          sku: string
          source_document_id: string | null
          specs: Json
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          certifications?: string[]
          cost_paise?: number | null
          created_at?: string
          description?: string | null
          distributor_price_paise?: number | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_paths?: string[]
          manufacturer_id: string
          moq?: number
          mrp_paise?: number | null
          name: string
          sku: string
          source_document_id?: string | null
          specs?: Json
          status?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          certifications?: string[]
          cost_paise?: number | null
          created_at?: string
          description?: string | null
          distributor_price_paise?: number | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_paths?: string[]
          manufacturer_id?: string
          moq?: number
          mrp_paise?: number | null
          name?: string
          sku?: string
          source_document_id?: string | null
          specs?: Json
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "products_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          approval_limit_paise: number | null
          created_at: string
          email: string | null
          full_name: string | null
          manufacturer_id: string | null
          permissions: string[]
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          approval_limit_paise?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          manufacturer_id?: string | null
          permissions?: string[]
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          approval_limit_paise?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          manufacturer_id?: string | null
          permissions?: string[]
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          active: boolean
          agent: string
          created_at: string
          id: string
          model: string | null
          notes: string | null
          system_prompt: string
          version: number
        }
        Insert: {
          active?: boolean
          agent: string
          created_at?: string
          id?: string
          model?: string | null
          notes?: string | null
          system_prompt: string
          version: number
        }
        Update: {
          active?: boolean
          agent?: string
          created_at?: string
          id?: string
          model?: string | null
          notes?: string | null
          system_prompt?: string
          version?: number
        }
        Relationships: []
      }
      prospect_events: {
        Row: {
          actor_id: string | null
          body: string | null
          client_ts: string | null
          created_at: string
          data: Json
          from_stage: Database["public"]["Enums"]["prospect_stage"] | null
          id: string
          kind: string
          manufacturer_id: string
          prospect_id: string
          to_stage: Database["public"]["Enums"]["prospect_stage"] | null
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          client_ts?: string | null
          created_at?: string
          data?: Json
          from_stage?: Database["public"]["Enums"]["prospect_stage"] | null
          id?: string
          kind: string
          manufacturer_id: string
          prospect_id: string
          to_stage?: Database["public"]["Enums"]["prospect_stage"] | null
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          client_ts?: string | null
          created_at?: string
          data?: Json
          from_stage?: Database["public"]["Enums"]["prospect_stage"] | null
          id?: string
          kind?: string
          manufacturer_id?: string
          prospect_id?: string
          to_stage?: Database["public"]["Enums"]["prospect_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_events_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_events_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "prospect_events_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_reviews: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          data: Json
          from_status: Database["public"]["Enums"]["review_status"] | null
          id: number
          manufacturer_id: string
          prospect_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["review_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          from_status?: Database["public"]["Enums"]["review_status"] | null
          id?: never
          manufacturer_id: string
          prospect_id: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["review_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          data?: Json
          from_status?: Database["public"]["Enums"]["review_status"] | null
          id?: never
          manufacturer_id?: string
          prospect_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["review_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_reviews_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_reviews_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "prospect_reviews_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          address: string | null
          assigned_rep_id: string | null
          attention_reason: string | null
          campaign_id: string | null
          category: string | null
          category_confidence: number | null
          city: string | null
          confidence: string
          created_at: string
          fit_breakdown: Json
          fit_config_version: number | null
          fit_score: number | null
          geo: unknown
          gstin: string | null
          id: string
          is_customer: boolean
          is_stale: boolean
          last_checked_at: string | null
          lat: number | null
          lng: number | null
          manufacturer_id: string
          merged_into: string | null
          name: string
          normalized_name: string | null
          outreach_approved: boolean
          outreach_approved_at: string | null
          pincode: string | null
          pipeline_step: string
          qualification: Json
          ref_code: string | null
          research: Json
          review_flags: string[]
          review_note: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          signals: Json
          source_id: string | null
          source_url: string | null
          stage: Database["public"]["Enums"]["prospect_stage"]
          stage_changed_at: string
          state: string | null
          type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          assigned_rep_id?: string | null
          attention_reason?: string | null
          campaign_id?: string | null
          category?: string | null
          category_confidence?: number | null
          city?: string | null
          confidence?: string
          created_at?: string
          fit_breakdown?: Json
          fit_config_version?: number | null
          fit_score?: number | null
          geo?: unknown
          gstin?: string | null
          id?: string
          is_customer?: boolean
          is_stale?: boolean
          last_checked_at?: string | null
          lat?: number | null
          lng?: number | null
          manufacturer_id: string
          merged_into?: string | null
          name: string
          normalized_name?: string | null
          outreach_approved?: boolean
          outreach_approved_at?: string | null
          pincode?: string | null
          pipeline_step?: string
          qualification?: Json
          ref_code?: string | null
          research?: Json
          review_flags?: string[]
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          signals?: Json
          source_id?: string | null
          source_url?: string | null
          stage?: Database["public"]["Enums"]["prospect_stage"]
          stage_changed_at?: string
          state?: string | null
          type?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          assigned_rep_id?: string | null
          attention_reason?: string | null
          campaign_id?: string | null
          category?: string | null
          category_confidence?: number | null
          city?: string | null
          confidence?: string
          created_at?: string
          fit_breakdown?: Json
          fit_config_version?: number | null
          fit_score?: number | null
          geo?: unknown
          gstin?: string | null
          id?: string
          is_customer?: boolean
          is_stale?: boolean
          last_checked_at?: string | null
          lat?: number | null
          lng?: number | null
          manufacturer_id?: string
          merged_into?: string | null
          name?: string
          normalized_name?: string | null
          outreach_approved?: boolean
          outreach_approved_at?: string | null
          pincode?: string | null
          pipeline_step?: string
          qualification?: Json
          ref_code?: string | null
          research?: Json
          review_flags?: string[]
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          signals?: Json
          source_id?: string | null
          source_url?: string | null
          stage?: Database["public"]["Enums"]["prospect_stage"]
          stage_changed_at?: string
          state?: string | null
          type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "prospects_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          confidence: number | null
          created_at: string
          diffs: Json
          error: string | null
          field_confidence: Json | null
          file_path: string
          id: string
          manufacturer_id: string
          match_status: Database["public"]["Enums"]["po_match_status"]
          message_id: string | null
          mime_type: string | null
          parsed: Json | null
          prospect_id: string
          quotation_id: string | null
          status: string
          uploaded_by: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          diffs?: Json
          error?: string | null
          field_confidence?: Json | null
          file_path: string
          id?: string
          manufacturer_id: string
          match_status?: Database["public"]["Enums"]["po_match_status"]
          message_id?: string | null
          mime_type?: string | null
          parsed?: Json | null
          prospect_id: string
          quotation_id?: string | null
          status?: string
          uploaded_by?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          diffs?: Json
          error?: string | null
          field_confidence?: Json | null
          file_path?: string
          id?: string
          manufacturer_id?: string
          match_status?: Database["public"]["Enums"]["po_match_status"]
          message_id?: string | null
          mime_type?: string | null
          parsed?: Json | null
          prospect_id?: string
          quotation_id?: string | null
          status?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "purchase_orders_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          id: string
          lines: Json
          manufacturer_id: string
          negotiation_id: string | null
          notes: string | null
          number: string
          payment_terms: string | null
          pdf_path: string | null
          prospect_id: string
          sent_at: string | null
          shipping_paise: number
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal_paise: number
          tax_mode: string
          tax_paise: number
          total_paise: number
          valid_until: string
          version: number
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lines: Json
          manufacturer_id: string
          negotiation_id?: string | null
          notes?: string | null
          number: string
          payment_terms?: string | null
          pdf_path?: string | null
          prospect_id: string
          sent_at?: string | null
          shipping_paise?: number
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal_paise: number
          tax_mode: string
          tax_paise: number
          total_paise: number
          valid_until: string
          version?: number
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lines?: Json
          manufacturer_id?: string
          negotiation_id?: string | null
          notes?: string | null
          number?: string
          payment_terms?: string | null
          pdf_path?: string | null
          prospect_id?: string
          sent_at?: string | null
          shipping_paise?: number
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal_paise?: number
          tax_mode?: string
          tax_paise?: number
          total_paise?: number
          valid_until?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "quotations_negotiation_id_fkey"
            columns: ["negotiation_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_records: {
        Row: {
          campaign_id: string
          created_at: string
          error: string | null
          external_id: string
          id: string
          manufacturer_id: string
          payload: Json
          prospect_id: string | null
          source_id: string
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error?: string | null
          external_id: string
          id?: string
          manufacturer_id: string
          payload: Json
          prospect_id?: string | null
          source_id: string
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error?: string | null
          external_id?: string
          id?: string
          manufacturer_id?: string
          payload?: Json
          prospect_id?: string | null
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_records_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_records_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_records_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "raw_records_prospect_fk"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_predictions: {
        Row: {
          avg_gap_days: number
          confidence: number
          id: string
          last_order_date: string
          manufacturer_id: string
          notified_for: string | null
          order_count: number
          predicted_date: string
          product_id: string
          prospect_id: string
          status: Database["public"]["Enums"]["reorder_status"]
          updated_at: string
        }
        Insert: {
          avg_gap_days: number
          confidence: number
          id?: string
          last_order_date: string
          manufacturer_id: string
          notified_for?: string | null
          order_count: number
          predicted_date: string
          product_id: string
          prospect_id: string
          status?: Database["public"]["Enums"]["reorder_status"]
          updated_at?: string
        }
        Update: {
          avg_gap_days?: number
          confidence?: number
          id?: string
          last_order_date?: string
          manufacturer_id?: string
          notified_for?: string | null
          order_count?: number
          predicted_date?: string
          product_id?: string
          prospect_id?: string
          status?: Database["public"]["Enums"]["reorder_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_predictions_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_predictions_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "reorder_predictions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_predictions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          delivered_at: string | null
          dispatched_at: string | null
          id: string
          manufacturer_id: string
          order_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_ref: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          carrier?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          id?: string
          manufacturer_id: string
          order_id: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_ref?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          carrier?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          id?: string
          manufacturer_id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_ref?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          adapter: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_run_at: string | null
          lawful_basis: string | null
          name: string
          terms_note: string | null
        }
        Insert: {
          adapter: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          lawful_basis?: string | null
          name: string
          terms_note?: string | null
        }
        Update: {
          adapter?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          lawful_basis?: string | null
          name?: string
          terms_note?: string | null
        }
        Relationships: []
      }
      stage_transitions: {
        Row: {
          from_stage: Database["public"]["Enums"]["prospect_stage"]
          to_stage: Database["public"]["Enums"]["prospect_stage"]
        }
        Insert: {
          from_stage: Database["public"]["Enums"]["prospect_stage"]
          to_stage: Database["public"]["Enums"]["prospect_stage"]
        }
        Update: {
          from_stage?: Database["public"]["Enums"]["prospect_stage"]
          to_stage?: Database["public"]["Enums"]["prospect_stage"]
        }
        Relationships: []
      }
      territories: {
        Row: {
          cities: string[]
          created_at: string
          distributor_prospect_id: string | null
          id: string
          manufacturer_id: string
          name: string
          state: string | null
          status: string
        }
        Insert: {
          cities?: string[]
          created_at?: string
          distributor_prospect_id?: string | null
          id?: string
          manufacturer_id: string
          name: string
          state?: string | null
          status?: string
        }
        Update: {
          cities?: string[]
          created_at?: string
          distributor_prospect_id?: string | null
          id?: string
          manufacturer_id?: string
          name?: string
          state?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "territories_distributor_fk"
            columns: ["distributor_prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territories_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territories_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
    }
    Views: {
      v_ai_health: {
        Row: {
          approval_rate_pct: number | null
          approvals: number | null
          autonomy_rate_pct: number | null
          escalation_rate_pct: number | null
          manufacturer_id: string | null
          median_approval_turnaround_min: number | null
          turns: number | null
          validator_blocks: number | null
        }
        Relationships: []
      }
      v_city_conversion: {
        Row: {
          city: string | null
          contacted: number | null
          customers: number | null
          manufacturer_id: string | null
          prospects: number | null
          qualified: number | null
          revenue_paise: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      v_duplicate_stats: {
        Row: {
          campaign_id: string | null
          kept_separate: number | null
          manufacturer_id: string | null
          merged: number | null
          pending: number | null
        }
        Relationships: [
          {
            foreignKeyName: "merge_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merge_candidates_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      v_funnel: {
        Row: {
          campaign_id: string | null
          contacted: number | null
          conversations: number | null
          identified: number | null
          manufacturer_id: string | null
          ordered: number | null
          qualified: number | null
          quoted: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      v_reorder_rate: {
        Row: {
          customers: number | null
          manufacturer_id: string | null
          reorder_rate_pct: number | null
          repeat_customers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      v_revenue_monthly: {
        Row: {
          accounts: number | null
          manufacturer_id: string | null
          month: string | null
          orders: number | null
          revenue_paise: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
      v_review_stats: {
        Row: {
          approved: number | null
          campaign_id: string | null
          discovered: number | null
          manufacturer_id: string | null
          median_review_hours: number | null
          merged: number | null
          needs_review: number | null
          outreach_started: number | null
          pending_review: number | null
          rejected: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "v_ai_health"
            referencedColumns: ["manufacturer_id"]
          },
        ]
      }
    }
    Functions: {
      advance_campaign: {
        Args: { p_campaign: string }
        Returns: Database["public"]["Enums"]["campaign_status"]
      }
      app_error: {
        Args: { p_code: string; p_field?: string; p_message: string }
        Returns: undefined
      }
      approve_outreach: {
        Args: { p_prospect_ids: string[]; p_rep?: string }
        Returns: Json
      }
      assign_prospects: {
        Args: { p_ids: string[]; p_rep: string }
        Returns: Json
      }
      auth_mid: { Args: never; Returns: string }
      auth_role: { Args: never; Returns: string }
      claim_ai_turn: {
        Args: { p_max_attempts?: number; p_turn: string }
        Returns: {
          attempts: number
          completed_at: string | null
          context: Json
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          manufacturer_id: string
          reason: string
          status: string
          trigger_message_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ai_turns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_outbound_message: { Args: { p_message: string }; Returns: Json }
      compute_reorders: { Args: never; Returns: number }
      confirm_document: {
        Args: { p_approved_for_sharing?: boolean; p_document: string }
        Returns: undefined
      }
      confirm_order: {
        Args: { p_override_reason?: string; p_po: string }
        Returns: string
      }
      consent_status_for: {
        Args: {
          p_channel?: Database["public"]["Enums"]["channel"]
          p_contact: string
        }
        Returns: Database["public"]["Enums"]["consent_status"]
      }
      create_campaign: {
        Args: {
          p_category?: string
          p_city: string
          p_name?: string
          p_objective: string
          p_parsed?: Json
          p_product_ids: string[]
          p_state: string
          p_target_count?: number
        }
        Returns: string
      }
      create_prospect_from_raw: { Args: { p_raw: string }; Returns: string }
      create_quotation: {
        Args: {
          p_lines?: Json
          p_negotiation: string
          p_notes?: string
          p_payment_terms?: string
          p_shipping_paise?: number
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      decide_approval: {
        Args: {
          p_counter_paise?: number
          p_decision: string
          p_id: string
          p_note?: string
        }
        Returns: Json
      }
      dismiss_reorder: { Args: { p_id: string }; Returns: undefined }
      enqueue_ai_turn: {
        Args: {
          p_context?: Json
          p_conversation: string
          p_reason: string
          p_trigger_message?: string
        }
        Returns: string
      }
      enqueue_outbound_message: {
        Args: {
          p_actor?: Database["public"]["Enums"]["message_actor"]
          p_ai_action?: string
          p_body: string
          p_conversation: string
          p_idempotency_key?: string
          p_media_filename?: string
          p_media_path?: string
          p_media_type?: string
          p_template?: string
          p_template_params?: Json
          p_turn?: string
        }
        Returns: string
      }
      erase_contact: {
        Args: { p_contact: string; p_reason: string }
        Returns: Json
      }
      escalate_to_human: {
        Args: { p_conversation: string; p_reason: string }
        Returns: string
      }
      evaluate_offer: {
        Args: { p_product: string; p_qty: number; p_requested_paise: number }
        Returns: {
          decision: string
          floor_paise: number
          hard_minimum_paise: number
          reason: string
          rule_snapshot: Json
          tier_qty_from: number
        }[]
      }
      finish_ai_turn: {
        Args: { p_error?: string; p_status: string; p_turn: string }
        Returns: undefined
      }
      flag_prospect: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      gst_state_code: { Args: { p_state: string }; Returns: string }
      has_permission: { Args: { p_permission: string }; Returns: boolean }
      import_prospect_records: {
        Args: { p_campaign: string; p_origin_note?: string; p_rows: Json }
        Returns: number
      }
      ingest_inbound_message: {
        Args: {
          p_body: string
          p_channel?: Database["public"]["Enums"]["channel"]
          p_from: string
          p_media_filename?: string
          p_media_mime?: string
          p_media_path?: string
          p_media_type?: string
          p_phone_number_id: string
          p_profile_name?: string
          p_provider_message_id: string
          p_sent_at?: string
        }
        Returns: Json
      }
      invoke_edge_function: {
        Args: { p_body?: Json; p_name: string }
        Returns: number
      }
      is_manager: { Args: never; Returns: boolean }
      is_system_admin: { Args: never; Returns: boolean }
      is_trusted: { Args: never; Returns: boolean }
      jwt_claims: { Args: never; Returns: Json }
      launch_campaign: {
        Args: { p_campaign: string; p_min_fit?: number }
        Returns: Json
      }
      log_prospect_event: {
        Args: {
          p_body: string
          p_client_ts?: string
          p_data?: Json
          p_idempotency_key?: string
          p_kind: string
          p_prospect: string
        }
        Returns: Json
      }
      log_qualification_field: {
        Args: { p_field: string; p_prospect: string; p_value: string }
        Returns: Json
      }
      log_review: {
        Args: {
          p_action: string
          p_data?: Json
          p_from: Database["public"]["Enums"]["review_status"]
          p_prospect: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["review_status"]
        }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { p_conversation: string }
        Returns: undefined
      }
      mark_message_failed: {
        Args: { p_error: string; p_final: boolean; p_message: string }
        Returns: undefined
      }
      mark_message_sent: {
        Args: { p_message: string; p_provider_message_id: string }
        Returns: undefined
      }
      match_knowledge: {
        Args: {
          p_count?: number
          p_manufacturer: string
          p_product?: string
          p_query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          metadata: Json
          product_id: string
          similarity: number
        }[]
      }
      match_purchase_order: {
        Args: { p_po: string }
        Returns: Database["public"]["Enums"]["po_match_status"]
      }
      merge_prospect_records: {
        Args: { p_drop: string; p_keep: string; p_note?: string }
        Returns: string
      }
      merge_prospects: {
        Args: { p_drop: string; p_keep: string; p_note?: string }
        Returns: string
      }
      negotiate_offer: {
        Args: {
          p_by_party?: string
          p_negotiation: string
          p_qty?: number
          p_requested_paise: number
          p_turn?: string
        }
        Returns: {
          allowed_price_paise: number
          approval_id: string
          decision: string
          floor_paise: number
          hard_minimum_paise: number
          offer_id: string
          reason: string
        }[]
      }
      normalize_business_name: { Args: { p_raw: string }; Returns: string }
      normalize_campaign_records: {
        Args: { p_campaign: string }
        Returns: Json
      }
      normalize_phone_e164: { Args: { p_raw: string }; Returns: string }
      notify_users: {
        Args: {
          p_body: string
          p_channels?: string[]
          p_data?: Json
          p_dedupe_key?: string
          p_kind: string
          p_link: string
          p_manufacturer: string
          p_title: string
          p_user_ids: string[]
        }
        Returns: number
      }
      open_negotiation: {
        Args: { p_conversation: string; p_product: string; p_qty: number }
        Returns: string
      }
      pause_ai: {
        Args: { p_conversation: string; p_reason?: string }
        Returns: undefined
      }
      permitted_users: {
        Args: { p_manufacturer: string; p_permission: string }
        Returns: string[]
      }
      pick_rep: { Args: { p_manufacturer: string }; Returns: string }
      process_approval_timers: { Args: never; Returns: number }
      process_due_followups: { Args: never; Returns: number }
      queue_delete: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: boolean
      }
      queue_read: {
        Args: { p_qty?: number; p_queue: string; p_vt?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      queue_retry: {
        Args: {
          p_error?: string
          p_max_attempts?: number
          p_msg_id: number
          p_queue: string
          p_read_ct: number
        }
        Returns: string
      }
      queue_send: {
        Args: { p_delay?: number; p_msg: Json; p_queue: string }
        Returns: number
      }
      refresh_review_status: {
        Args: { p_prospect: string }
        Returns: Database["public"]["Enums"]["review_status"]
      }
      register_purchase_order: {
        Args: {
          p_file_path: string
          p_message?: string
          p_mime?: string
          p_prospect: string
          p_quotation?: string
        }
        Returns: string
      }
      rep_can_see: { Args: { p_prospect: string }; Returns: boolean }
      rep_can_see_conversation: {
        Args: { p_conversation: string }
        Returns: boolean
      }
      request_approval: {
        Args: {
          p_context?: Json
          p_conversation: string
          p_kind: Database["public"]["Enums"]["approval_kind"]
          p_negotiation?: string
          p_recommendation?: string
          p_requested_paise?: number
          p_summary: string
        }
        Returns: string
      }
      request_price_approval: {
        Args: {
          p_floor_paise: number
          p_hard_minimum_paise: number
          p_negotiation: string
          p_qty: number
          p_recommendation: string
          p_requested_paise: number
        }
        Returns: string
      }
      resolve_duplicate: {
        Args: { p_candidate: string; p_merge: boolean; p_note?: string }
        Returns: Json
      }
      resume_ai: { Args: { p_conversation: string }; Returns: undefined }
      review_prospects: {
        Args: { p_decision: string; p_ids: string[]; p_reason?: string }
        Returns: Json
      }
      schedule_followup: {
        Args: {
          p_conversation: string
          p_created_by?: string
          p_due_at: string
          p_reason: string
        }
        Returns: string
      }
      score_prospect: { Args: { p_prospect: string }; Returns: number }
      search_knowledge: {
        Args: {
          p_count?: number
          p_manufacturer: string
          p_product?: string
          p_query: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          metadata: Json
          product_id: string
          similarity: number
        }[]
      }
      send_human_message: {
        Args: {
          p_body: string
          p_conversation: string
          p_idempotency_key?: string
          p_template?: string
        }
        Returns: string
      }
      set_consent: {
        Args: {
          p_channel?: Database["public"]["Enums"]["channel"]
          p_contact: string
          p_evidence?: Json
          p_source: string
          p_status: Database["public"]["Enums"]["consent_status"]
        }
        Returns: Database["public"]["Enums"]["consent_status"]
      }
      set_member_permissions: {
        Args: { p_permissions: string[]; p_user: string }
        Returns: string[]
      }
      set_prospect_classification: {
        Args: {
          p_category: string
          p_confidence: number
          p_prospect: string
          p_reason?: string
          p_type: string
        }
        Returns: undefined
      }
      set_prospect_research: {
        Args: { p_prospect: string; p_research: Json; p_signals: Json }
        Returns: number
      }
      set_stage: {
        Args: {
          p_client_ts?: string
          p_idempotency_key?: string
          p_note?: string
          p_prospect: string
          p_to: Database["public"]["Enums"]["prospect_stage"]
        }
        Returns: Json
      }
      set_stage_internal: {
        Args: {
          p_actor: string
          p_note: string
          p_prospect: string
          p_to: Database["public"]["Enums"]["prospect_stage"]
        }
        Returns: boolean
      }
      settle_negotiation: {
        Args: {
          p_negotiation: string
          p_price_paise: number
          p_qty?: number
          p_turn?: string
        }
        Returns: Json
      }
      sysadmin_dead_letters: {
        Args: { p_limit?: number }
        Returns: {
          archived_at: string
          enqueued_at: string
          message: Json
          msg_id: number
          queue_name: string
          read_ct: number
        }[]
      }
      sysadmin_platform_health: { Args: never; Returns: Json }
      sysadmin_queue_metrics: {
        Args: never
        Returns: {
          dead_letters: number
          oldest_msg_age_sec: number
          queue_length: number
          queue_name: string
          total_messages: number
        }[]
      }
      sysadmin_retry_dead_letter: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: number
      }
      sysadmin_source_health: {
        Args: never
        Returns: {
          adapter: string
          enabled: boolean
          failed_jobs_30d: number
          id: string
          jobs_30d: number
          last_run_at: string
          lawful_basis: string
          name: string
          records_30d: number
          terms_note: string
          yield_pct: number
        }[]
      }
      sysadmin_tenants: {
        Args: never
        Returns: {
          campaigns: number
          city: string
          created_at: string
          gstin: string
          id: string
          legal_name: string
          name: string
          products: number
          state: string
          users: number
          whatsapp_display_number: string
          whatsapp_phone_number_id: string
        }[]
      }
      sysadmin_users: { Args: never; Returns: string[] }
      tenant_users: {
        Args: {
          p_manufacturer: string
          p_roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: string[]
      }
      update_fit_weights: { Args: { p_weights: Json }; Returns: number }
      update_message_status: {
        Args: {
          p_at?: string
          p_error?: string
          p_provider_message_id: string
          p_status: string
        }
        Returns: boolean
      }
      update_order_status: {
        Args: {
          p_carrier?: string
          p_order: string
          p_payment?: Database["public"]["Enums"]["payment_status"]
          p_payment_ref?: string
          p_shipment?: Database["public"]["Enums"]["shipment_status"]
          p_tracking_ref?: string
        }
        Returns: undefined
      }
      update_prospect_details: {
        Args: { p_fields: Json; p_id: string; p_reason?: string }
        Returns: Json
      }
      wake_worker: {
        Args: { p_function: string; p_queue: string }
        Returns: boolean
      }
      write_audit: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity: string
          p_entity_id: string
          p_manufacturer: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "sales_head" | "rep" | "system_admin"
      approval_kind:
        | "price_below_floor"
        | "payment_terms"
        | "credit"
        | "sample"
        | "custom_quotation"
        | "other"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "countered"
        | "expired"
      autonomy_tier: "autonomous" | "approval" | "human_only"
      campaign_status:
        | "draft"
        | "discovering"
        | "scoring"
        | "lead_review"
        | "ready"
        | "live"
        | "paused"
        | "completed"
        | "failed"
      channel: "whatsapp" | "sms" | "email" | "voice"
      consent_status: "none" | "engaged" | "opted_in" | "opted_out"
      followup_status: "pending" | "processing" | "done" | "cancelled"
      message_actor: "buyer" | "ai" | "rep" | "owner" | "system"
      message_direction: "inbound" | "outbound"
      message_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "received"
        | "blocked"
        | "cancelled"
      negotiation_status:
        | "open"
        | "awaiting_approval"
        | "agreed"
        | "quoted"
        | "rejected"
        | "closed"
      offer_decision:
        | "accept"
        | "needs_approval"
        | "reject"
        | "approved"
        | "countered"
        | "declined"
      order_status:
        | "confirmed"
        | "dispatched"
        | "in_transit"
        | "delivered"
        | "cancelled"
      payment_status: "due" | "paid" | "overdue"
      po_match_status: "pending" | "matched" | "mismatch" | "needs_review"
      prospect_stage:
        | "new"
        | "contacted"
        | "engaged"
        | "qualified"
        | "negotiating"
        | "quoted"
        | "first_order"
        | "repeat_order"
        | "lost"
      quotation_status:
        | "draft"
        | "generating"
        | "sent"
        | "superseded"
        | "accepted"
        | "expired"
      reorder_status: "upcoming" | "due" | "overdue" | "ordered" | "dismissed"
      review_status:
        | "pending"
        | "needs_review"
        | "approved"
        | "rejected"
        | "merged"
      shipment_status: "pending" | "dispatched" | "in_transit" | "delivered"
      template_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "paused"
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
      app_role: ["owner", "sales_head", "rep", "system_admin"],
      approval_kind: [
        "price_below_floor",
        "payment_terms",
        "credit",
        "sample",
        "custom_quotation",
        "other",
      ],
      approval_status: [
        "pending",
        "approved",
        "rejected",
        "countered",
        "expired",
      ],
      autonomy_tier: ["autonomous", "approval", "human_only"],
      campaign_status: [
        "draft",
        "discovering",
        "scoring",
        "lead_review",
        "ready",
        "live",
        "paused",
        "completed",
        "failed",
      ],
      channel: ["whatsapp", "sms", "email", "voice"],
      consent_status: ["none", "engaged", "opted_in", "opted_out"],
      followup_status: ["pending", "processing", "done", "cancelled"],
      message_actor: ["buyer", "ai", "rep", "owner", "system"],
      message_direction: ["inbound", "outbound"],
      message_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
        "received",
        "blocked",
        "cancelled",
      ],
      negotiation_status: [
        "open",
        "awaiting_approval",
        "agreed",
        "quoted",
        "rejected",
        "closed",
      ],
      offer_decision: [
        "accept",
        "needs_approval",
        "reject",
        "approved",
        "countered",
        "declined",
      ],
      order_status: [
        "confirmed",
        "dispatched",
        "in_transit",
        "delivered",
        "cancelled",
      ],
      payment_status: ["due", "paid", "overdue"],
      po_match_status: ["pending", "matched", "mismatch", "needs_review"],
      prospect_stage: [
        "new",
        "contacted",
        "engaged",
        "qualified",
        "negotiating",
        "quoted",
        "first_order",
        "repeat_order",
        "lost",
      ],
      quotation_status: [
        "draft",
        "generating",
        "sent",
        "superseded",
        "accepted",
        "expired",
      ],
      reorder_status: ["upcoming", "due", "overdue", "ordered", "dismissed"],
      review_status: [
        "pending",
        "needs_review",
        "approved",
        "rejected",
        "merged",
      ],
      shipment_status: ["pending", "dispatched", "in_transit", "delivered"],
      template_status: ["draft", "submitted", "approved", "rejected", "paused"],
    },
  },
} as const

