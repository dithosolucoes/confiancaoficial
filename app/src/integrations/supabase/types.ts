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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          iban: string | null
          id: string
          is_approved: boolean
          name: string
          nif: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          is_approved?: boolean
          name: string
          nif?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          is_approved?: boolean
          name?: string
          nif?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      accounts_payable: {
        Row: {
          category: Database["public"]["Enums"]["payable_category"]
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          installment_current: number | null
          installments_total: number | null
          is_installment: boolean
          is_recurring: boolean
          next_due_date: string | null
          notes: string | null
          paid_amount: number
          paid_at: string | null
          parent_id: string | null
          payment_method: string | null
          recurrence_frequency:
            | Database["public"]["Enums"]["payable_frequency"]
            | null
          source_batch_id: string | null
          status: Database["public"]["Enums"]["payable_status"]
          supplier_iban: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["payable_category"]
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          installment_current?: number | null
          installments_total?: number | null
          is_installment?: boolean
          is_recurring?: boolean
          next_due_date?: string | null
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          parent_id?: string | null
          payment_method?: string | null
          recurrence_frequency?:
            | Database["public"]["Enums"]["payable_frequency"]
            | null
          source_batch_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          supplier_iban?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["payable_category"]
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          installment_current?: number | null
          installments_total?: number | null
          is_installment?: boolean
          is_recurring?: boolean
          next_due_date?: string | null
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          parent_id?: string | null
          payment_method?: string | null
          recurrence_frequency?:
            | Database["public"]["Enums"]["payable_frequency"]
            | null
          source_batch_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          supplier_iban?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "technician_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_entries: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          id: string
          kind: string
          notes: string | null
          origin: string | null
          payment_method: string | null
          source_payable_id: string | null
          source_service_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          id?: string
          kind: string
          notes?: string | null
          origin?: string | null
          payment_method?: string | null
          source_payable_id?: string | null
          source_service_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          id?: string
          kind?: string
          notes?: string | null
          origin?: string | null
          payment_method?: string | null
          source_payable_id?: string | null
          source_service_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_entries_source_payable_id_fkey"
            columns: ["source_payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_entries_source_service_id_fkey"
            columns: ["source_service_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_settings: {
        Row: {
          created_at: string
          id: string
          initial_balance: number
          initial_balance_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          initial_balance?: number
          initial_balance_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          initial_balance?: number
          initial_balance_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          customer_id: string
          gestor_unread_count: number
          id: string
          participant_name: string
          participant_type: string
          participant_unread_count: number
          service_reference: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          gestor_unread_count?: number
          id?: string
          participant_name?: string
          participant_type?: string
          participant_unread_count?: number
          service_reference?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          gestor_unread_count?: number
          id?: string
          participant_name?: string
          participant_type?: string
          participant_unread_count?: number
          service_reference?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_type?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_legacy_audit: {
        Row: {
          applied_by: string | null
          created_at: string
          id: string
          partner_organization_id: string | null
          previous_config: Json
          reason: string | null
          restored_config: Json
          service_request_id: string
        }
        Insert: {
          applied_by?: string | null
          created_at?: string
          id?: string
          partner_organization_id?: string | null
          previous_config: Json
          reason?: string | null
          restored_config: Json
          service_request_id: string
        }
        Update: {
          applied_by?: string | null
          created_at?: string
          id?: string
          partner_organization_id?: string | null
          previous_config?: Json
          reason?: string | null
          restored_config?: Json
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_legacy_audit_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_legacy_audit_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mileage_audit: {
        Row: {
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
          setting_id: string | null
          trip_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          setting_id?: string | null
          trip_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          setting_id?: string | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mileage_audit_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "mileage_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "mileage_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      mileage_settings: {
        Row: {
          created_at: string
          id: string
          office_address: string
          office_lat: number
          office_lng: number
          rate_per_km: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          office_address?: string
          office_lat?: number
          office_lng?: number
          rate_per_km?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          office_address?: string
          office_lat?: number
          office_lng?: number
          rate_per_km?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mileage_trips: {
        Row: {
          created_at: string
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          distance_km: number
          duration_minutes: number | null
          ended_at: string | null
          id: string
          manual_override: boolean
          origin_address: string | null
          origin_lat: number | null
          origin_lng: number | null
          overridden_by: string | null
          override_reason: string | null
          reference: string | null
          service_request_id: string | null
          started_at: string
          technician_id: string
          trip_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          distance_km?: number
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          manual_override?: boolean
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          overridden_by?: string | null
          override_reason?: string | null
          reference?: string | null
          service_request_id?: string | null
          started_at?: string
          technician_id: string
          trip_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          distance_km?: number
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          manual_override?: boolean
          origin_address?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          overridden_by?: string | null
          override_reason?: string | null
          reference?: string | null
          service_request_id?: string | null
          started_at?: string
          technician_id?: string
          trip_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_trips_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          address_complement: string | null
          billing_address: string | null
          billing_name: string | null
          billing_nif: string | null
          company_id: string | null
          created_at: string
          email: string | null
          emergency_contact: string | null
          full_name: string
          gps_consent_at: string | null
          gps_lat: number | null
          gps_lng: number | null
          iban: string | null
          id: string
          is_approved: boolean
          is_partner: boolean
          is_paused: boolean
          localidade: string | null
          phone: string | null
          postal_code: string | null
          surname: string | null
          user_id: string
          user_type: string
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          billing_address?: string | null
          billing_name?: string | null
          billing_nif?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          emergency_contact?: string | null
          full_name?: string
          gps_consent_at?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          iban?: string | null
          id?: string
          is_approved?: boolean
          is_partner?: boolean
          is_paused?: boolean
          localidade?: string | null
          phone?: string | null
          postal_code?: string | null
          surname?: string | null
          user_id: string
          user_type?: string
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          billing_address?: string | null
          billing_name?: string | null
          billing_nif?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          emergency_contact?: string | null
          full_name?: string
          gps_consent_at?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          iban?: string | null
          id?: string
          is_approved?: boolean
          is_partner?: boolean
          is_paused?: boolean
          localidade?: string | null
          phone?: string | null
          postal_code?: string | null
          surname?: string | null
          user_id?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_parts_items: {
        Row: {
          cost_without_vat: number
          created_at: string
          id: string
          part_name: string
          position: number
          sale_value: number
          service_request_id: string
          updated_at: string
        }
        Insert: {
          cost_without_vat?: number
          created_at?: string
          id?: string
          part_name?: string
          position?: number
          sale_value?: number
          service_request_id: string
          updated_at?: string
        }
        Update: {
          cost_without_vat?: number
          created_at?: string
          id?: string
          part_name?: string
          position?: number
          sale_value?: number
          service_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_parts_items_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_materials: {
        Row: {
          created_at: string
          id: string
          invoice_photo_url: string | null
          material_cost: number
          material_name: string
          notes: string | null
          photo_url_1: string | null
          photo_url_2: string | null
          quantity: number
          service_request_id: string
          status: string
          supplier_cost: number | null
          technician_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_photo_url?: string | null
          material_cost?: number
          material_name: string
          notes?: string | null
          photo_url_1?: string | null
          photo_url_2?: string | null
          quantity?: number
          service_request_id: string
          status?: string
          supplier_cost?: number | null
          technician_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_photo_url?: string | null
          material_cost?: number
          material_name?: string
          notes?: string | null
          photo_url_1?: string | null
          photo_url_2?: string | null
          quantity?: number
          service_request_id?: string
          status?: string
          supplier_cost?: number | null
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_materials_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_materials_history: {
        Row: {
          changed_by: string
          changed_by_role: string
          created_at: string
          id: string
          material_id: string
          new_status: string | null
          new_value: Json | null
          previous_status: string | null
          previous_value: Json | null
          service_request_id: string
        }
        Insert: {
          changed_by: string
          changed_by_role?: string
          created_at?: string
          id?: string
          material_id: string
          new_status?: string | null
          new_value?: Json | null
          previous_status?: string | null
          previous_value?: Json | null
          service_request_id: string
        }
        Update: {
          changed_by?: string
          changed_by_role?: string
          created_at?: string
          id?: string
          material_id?: string
          new_status?: string | null
          new_value?: Json | null
          previous_status?: string | null
          previous_value?: Json | null
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_materials_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "service_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      service_photos: {
        Row: {
          created_at: string
          id: string
          is_warranty_photo: boolean
          photo_url: string
          service_request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_warranty_photo?: boolean
          photo_url: string
          service_request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_warranty_photo?: boolean
          photo_url?: string
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_photos_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_ratings: {
        Row: {
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          rating: number
          service_request_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          rating: number
          service_request_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          rating?: number
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_ratings_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          address: string
          address_complement: string | null
          appliance_type: string
          assigned_company_id: string | null
          baixa_received_at: string | null
          booking_paid_at: string | null
          cash_payment: boolean | null
          cash_payment_amount: number | null
          completed_at: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          description: string
          deslocacao_fee: number | null
          equipment_age: string | null
          equipment_brand: string | null
          equipment_model: string | null
          equipment_number: string | null
          equipment_photo_url: string | null
          equipment_working: boolean | null
          estimated_arrival_time: string | null
          extra_fee: number | null
          fixed_payout_amount: number | null
          gestor_notes: string | null
          gestor_private_note: string | null
          id: string
          invoice_issued_at: string | null
          invoice_number: string | null
          invoice_paid_at: string | null
          is_invoiced: boolean
          is_warranty: boolean
          labor_approved_at: string | null
          labor_cost: number | null
          labor_paid_at: string | null
          labor_rejected_at: string | null
          legacy_parts_markup: boolean
          localidade: string | null
          materials_paid_at: string | null
          original_scheduled_date: string | null
          original_scheduled_time: string | null
          parent_service_id: string | null
          postal_code: string
          quote_additional_cost: number | null
          quote_additional_description: string | null
          quote_additional_value: number | null
          quote_paid_at: string | null
          quote_part_arrival_date: string | null
          quote_part_received_at: string | null
          quote_parts: number | null
          quote_parts_name: string | null
          quote_payment_amount: number | null
          quote_payment_marked_by: string | null
          quote_payment_method: string | null
          quote_payment_note: string | null
          quote_payment_source: string | null
          quote_rejected_at: string | null
          quote_status: string | null
          quote_supplier_cost: number | null
          quote_supplier_invoice_url: string | null
          quote_travel: number | null
          received_at: string | null
          reference: string
          report_text: string | null
          report_url: string | null
          returned_to_office_at: string | null
          scheduled_date: string
          scheduled_time: string
          started_at: string | null
          status: string
          suggested_at: string | null
          suggested_by_technician_id: string | null
          suggested_date: string | null
          suggested_time: string | null
          suggestion_status: string | null
          tech_eta_computed_at: string | null
          tech_eta_distance_km: number | null
          tech_eta_minutes: number | null
          tech_on_the_way_at: string | null
          tech_origin_lat: number | null
          tech_origin_lng: number | null
          tech_payment_vat_rate: number
          technician_id: string | null
          technician_payout: number | null
          technician_payout_locked: boolean
          technician_payout_overridden: boolean
          updated_at: string
          warranty_completed_at: string | null
          warranty_report_text: string | null
          warranty_report_url: string | null
          warranty_return_date: string | null
          warranty_return_description: string | null
          warranty_return_requested_at: string | null
          warranty_return_time: string | null
          warranty_started_at: string | null
        }
        Insert: {
          address?: string
          address_complement?: string | null
          appliance_type: string
          assigned_company_id?: string | null
          baixa_received_at?: string | null
          booking_paid_at?: string | null
          cash_payment?: boolean | null
          cash_payment_amount?: number | null
          completed_at?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          description: string
          deslocacao_fee?: number | null
          equipment_age?: string | null
          equipment_brand?: string | null
          equipment_model?: string | null
          equipment_number?: string | null
          equipment_photo_url?: string | null
          equipment_working?: boolean | null
          estimated_arrival_time?: string | null
          extra_fee?: number | null
          fixed_payout_amount?: number | null
          gestor_notes?: string | null
          gestor_private_note?: string | null
          id?: string
          invoice_issued_at?: string | null
          invoice_number?: string | null
          invoice_paid_at?: string | null
          is_invoiced?: boolean
          is_warranty?: boolean
          labor_approved_at?: string | null
          labor_cost?: number | null
          labor_paid_at?: string | null
          labor_rejected_at?: string | null
          legacy_parts_markup?: boolean
          localidade?: string | null
          materials_paid_at?: string | null
          original_scheduled_date?: string | null
          original_scheduled_time?: string | null
          parent_service_id?: string | null
          postal_code?: string
          quote_additional_cost?: number | null
          quote_additional_description?: string | null
          quote_additional_value?: number | null
          quote_paid_at?: string | null
          quote_part_arrival_date?: string | null
          quote_part_received_at?: string | null
          quote_parts?: number | null
          quote_parts_name?: string | null
          quote_payment_amount?: number | null
          quote_payment_marked_by?: string | null
          quote_payment_method?: string | null
          quote_payment_note?: string | null
          quote_payment_source?: string | null
          quote_rejected_at?: string | null
          quote_status?: string | null
          quote_supplier_cost?: number | null
          quote_supplier_invoice_url?: string | null
          quote_travel?: number | null
          received_at?: string | null
          reference?: string
          report_text?: string | null
          report_url?: string | null
          returned_to_office_at?: string | null
          scheduled_date: string
          scheduled_time: string
          started_at?: string | null
          status?: string
          suggested_at?: string | null
          suggested_by_technician_id?: string | null
          suggested_date?: string | null
          suggested_time?: string | null
          suggestion_status?: string | null
          tech_eta_computed_at?: string | null
          tech_eta_distance_km?: number | null
          tech_eta_minutes?: number | null
          tech_on_the_way_at?: string | null
          tech_origin_lat?: number | null
          tech_origin_lng?: number | null
          tech_payment_vat_rate?: number
          technician_id?: string | null
          technician_payout?: number | null
          technician_payout_locked?: boolean
          technician_payout_overridden?: boolean
          updated_at?: string
          warranty_completed_at?: string | null
          warranty_report_text?: string | null
          warranty_report_url?: string | null
          warranty_return_date?: string | null
          warranty_return_description?: string | null
          warranty_return_requested_at?: string | null
          warranty_return_time?: string | null
          warranty_started_at?: string | null
        }
        Update: {
          address?: string
          address_complement?: string | null
          appliance_type?: string
          assigned_company_id?: string | null
          baixa_received_at?: string | null
          booking_paid_at?: string | null
          cash_payment?: boolean | null
          cash_payment_amount?: number | null
          completed_at?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          description?: string
          deslocacao_fee?: number | null
          equipment_age?: string | null
          equipment_brand?: string | null
          equipment_model?: string | null
          equipment_number?: string | null
          equipment_photo_url?: string | null
          equipment_working?: boolean | null
          estimated_arrival_time?: string | null
          extra_fee?: number | null
          fixed_payout_amount?: number | null
          gestor_notes?: string | null
          gestor_private_note?: string | null
          id?: string
          invoice_issued_at?: string | null
          invoice_number?: string | null
          invoice_paid_at?: string | null
          is_invoiced?: boolean
          is_warranty?: boolean
          labor_approved_at?: string | null
          labor_cost?: number | null
          labor_paid_at?: string | null
          labor_rejected_at?: string | null
          legacy_parts_markup?: boolean
          localidade?: string | null
          materials_paid_at?: string | null
          original_scheduled_date?: string | null
          original_scheduled_time?: string | null
          parent_service_id?: string | null
          postal_code?: string
          quote_additional_cost?: number | null
          quote_additional_description?: string | null
          quote_additional_value?: number | null
          quote_paid_at?: string | null
          quote_part_arrival_date?: string | null
          quote_part_received_at?: string | null
          quote_parts?: number | null
          quote_parts_name?: string | null
          quote_payment_amount?: number | null
          quote_payment_marked_by?: string | null
          quote_payment_method?: string | null
          quote_payment_note?: string | null
          quote_payment_source?: string | null
          quote_rejected_at?: string | null
          quote_status?: string | null
          quote_supplier_cost?: number | null
          quote_supplier_invoice_url?: string | null
          quote_travel?: number | null
          received_at?: string | null
          reference?: string
          report_text?: string | null
          report_url?: string | null
          returned_to_office_at?: string | null
          scheduled_date?: string
          scheduled_time?: string
          started_at?: string | null
          status?: string
          suggested_at?: string | null
          suggested_by_technician_id?: string | null
          suggested_date?: string | null
          suggested_time?: string | null
          suggestion_status?: string | null
          tech_eta_computed_at?: string | null
          tech_eta_distance_km?: number | null
          tech_eta_minutes?: number | null
          tech_on_the_way_at?: string | null
          tech_origin_lat?: number | null
          tech_origin_lng?: number | null
          tech_payment_vat_rate?: number
          technician_id?: string | null
          technician_payout?: number | null
          technician_payout_locked?: boolean
          technician_payout_overridden?: boolean
          updated_at?: string
          warranty_completed_at?: string | null
          warranty_report_text?: string | null
          warranty_report_url?: string | null
          warranty_return_date?: string | null
          warranty_return_description?: string | null
          warranty_return_requested_at?: string | null
          warranty_return_time?: string | null
          warranty_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_assigned_company_id_fkey"
            columns: ["assigned_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_parent_service_id_fkey"
            columns: ["parent_service_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_return_visits: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          photos: Json
          report_text: string | null
          report_url: string | null
          requested_at: string | null
          return_date: string | null
          return_time: string | null
          sequence: number
          service_request_id: string
          started_at: string | null
          status: string
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          photos?: Json
          report_text?: string | null
          report_url?: string | null
          requested_at?: string | null
          return_date?: string | null
          return_time?: string | null
          sequence: number
          service_request_id: string
          started_at?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          photos?: Json
          report_text?: string | null
          report_url?: string | null
          requested_at?: string | null
          return_date?: string | null
          return_time?: string | null
          sequence?: number
          service_request_id?: string
          started_at?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_return_visits_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedule_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string | null
          event_time: string | null
          event_type: string
          id: string
          metadata: Json
          service_request_id: string
          status: string | null
          technician_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          event_type: string
          id?: string
          metadata?: Json
          service_request_id: string
          status?: string | null
          technician_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string | null
          event_time?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          service_request_id?: string
          status?: string | null
          technician_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedule_events_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          iban: string | null
          id: string
          name: string
          nif: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          contact?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          iban?: string | null
          id?: string
          name: string
          nif?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          contact?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          iban?: string | null
          id?: string
          name?: string
          nif?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      technician_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          service_request_id: string | null
          technician_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          service_request_id?: string | null
          technician_id: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          service_request_id?: string | null
          technician_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_notifications_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_payout_audit: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_amount: number
          old_amount: number | null
          reason: string | null
          service_request_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_amount: number
          old_amount?: number | null
          reason?: string | null
          service_request_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_amount?: number
          old_amount?: number | null
          reason?: string | null
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_payout_audit_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_payout_batch_items: {
        Row: {
          amount: number
          batch_id: string
          created_at: string
          id: string
          service_request_id: string
        }
        Insert: {
          amount?: number
          batch_id: string
          created_at?: string
          id?: string
          service_request_id: string
        }
        Update: {
          amount?: number
          batch_id?: string
          created_at?: string
          id?: string
          service_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_payout_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "technician_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_payout_batch_items_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_payout_batches: {
        Row: {
          created_at: string
          id: string
          label: string
          paid_at: string | null
          payable_id: string | null
          payment_method: string | null
          period_end: string
          period_start: string
          period_type: string
          status: string
          technician_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          paid_at?: string | null
          payable_id?: string | null
          payment_method?: string | null
          period_end: string
          period_start: string
          period_type: string
          status?: string
          technician_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          paid_at?: string | null
          payable_id?: string | null
          payment_method?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          status?: string
          technician_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_payout_batches_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_payout_rates: {
        Row: {
          amount: number
          reference: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          reference: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          reference?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      technician_payout_settings: {
        Row: {
          created_at: string
          id: string
          period_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          period_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          period_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_execute_open_batch_reconciliation: {
        Args: never
        Returns: {
          batches_updated: number
          items_corrected: number
          payables_updated: number
          total_delta: number
        }[]
      }
      admin_preview_open_batch_reconciliation: {
        Args: never
        Returns: {
          batch_id: string
          batch_item_id: string
          batch_label: string
          current_item_amount: number
          difference: number
          official_payout: number
          payable_id: string
          service_reference: string
          service_request_id: string
          technician_id: string
          technician_name: string
        }[]
      }
      can_access_service_media: {
        Args: { _service_id: string }
        Returns: boolean
      }
      compute_payout_period: {
        Args: { _period: string; _ref_date: string }
        Returns: {
          label: string
          period_end: string
          period_start: string
        }[]
      }
      get_partner_user_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      is_approved_technician: { Args: { _user_id: string }; Returns: boolean }
      is_gestor: { Args: { _user_id: string }; Returns: boolean }
      is_partner_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_service_technician: { Args: { _service_id: string }; Returns: boolean }
      recalc_payout_batch: { Args: { _batch_id: string }; Returns: undefined }
      recalculate_all_technician_payouts: {
        Args: never
        Returns: {
          updated_count: number
        }[]
      }
      recompute_service_payout: {
        Args: { _service_id: string }
        Returns: undefined
      }
      reconcile_all_payout_batches: {
        Args: never
        Returns: {
          analyzed: number
          corrected: number
          deleted: number
        }[]
      }
      resolve_payout_amount: {
        Args: { _appliance: string; _ref: string }
        Returns: number
      }
      resolve_service_payout_amount: {
        Args: { _service_id: string }
        Returns: number
      }
      sync_cash_flow_from_payable: {
        Args: { _payable_id: string }
        Returns: undefined
      }
    }
    Enums: {
      payable_category:
        | "salarios"
        | "seguranca_social"
        | "combustivel"
        | "telecomunicacoes"
        | "internet"
        | "contabilidade"
        | "fornecedores"
        | "veiculos"
        | "seguros"
        | "impostos"
        | "marketing"
        | "software"
        | "outros"
        | "portagem"
        | "alimentacao"
        | "taxas"
        | "aluguel"
        | "tecnicos"
      payable_frequency:
        | "semanal"
        | "mensal"
        | "trimestral"
        | "semestral"
        | "anual"
      payable_status:
        | "pendente"
        | "pago"
        | "parcialmente_pago"
        | "atrasado"
        | "cancelado"
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
      payable_category: [
        "salarios",
        "seguranca_social",
        "combustivel",
        "telecomunicacoes",
        "internet",
        "contabilidade",
        "fornecedores",
        "veiculos",
        "seguros",
        "impostos",
        "marketing",
        "software",
        "outros",
        "portagem",
        "alimentacao",
        "taxas",
        "aluguel",
        "tecnicos",
      ],
      payable_frequency: [
        "semanal",
        "mensal",
        "trimestral",
        "semestral",
        "anual",
      ],
      payable_status: [
        "pendente",
        "pago",
        "parcialmente_pago",
        "atrasado",
        "cancelado",
      ],
    },
  },
} as const
