export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_events: {
        Row: {
          booking_id: string | null
          device_id: string | null
          event_type: Database["public"]["Enums"]["access_event_type"]
          id: string
          metadata: Json
          occurred_at: string
          reason: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          device_id?: string | null
          event_type: Database["public"]["Enums"]["access_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          device_id?: string | null
          event_type?: Database["public"]["Enums"]["access_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          reason?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_units: {
        Row: {
          acquired_at: string | null
          asset_tag: string
          component_id: string
          condition_note: string | null
          created_at: string
          id: string
          inventory_location_id: string
          inventory_lot_id: string | null
          metadata: Json
          rfid_epc: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_unit_status"]
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          asset_tag: string
          component_id: string
          condition_note?: string | null
          created_at?: string
          id?: string
          inventory_location_id: string
          inventory_lot_id?: string | null
          metadata?: Json
          rfid_epc?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_unit_status"]
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          asset_tag?: string
          component_id?: string
          condition_note?: string | null
          created_at?: string
          id?: string
          inventory_location_id?: string
          inventory_lot_id?: string | null
          metadata?: Json
          rfid_epc?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_unit_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_units_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_units_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "public_component_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_units_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_units_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["inventory_location_id"]
          },
          {
            foreignKeyName: "asset_units_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          booking_id: string | null
          checked_in_at: string
          checked_in_by_device: string | null
          checked_out_at: string | null
          checked_out_by_device: string | null
          created_at: string
          id: string
          location_id: string
          override_by: string | null
          override_reason: string | null
          resource_id: string | null
          review_flags: Json
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          checked_in_at?: string
          checked_in_by_device?: string | null
          checked_out_at?: string | null
          checked_out_by_device?: string | null
          created_at?: string
          id?: string
          location_id: string
          override_by?: string | null
          override_reason?: string | null
          resource_id?: string | null
          review_flags?: Json
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          checked_in_at?: string
          checked_in_by_device?: string | null
          checked_out_at?: string | null
          checked_out_by_device?: string | null
          created_at?: string
          id?: string
          location_id?: string
          override_by?: string | null
          override_reason?: string | null
          resource_id?: string | null
          review_flags?: Json
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_checked_in_by_device_fkey"
            columns: ["checked_in_by_device"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_checked_out_by_device_fkey"
            columns: ["checked_out_by_device"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          occurred_at: string
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          occurred_at?: string
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          occurred_at?: string
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      booking_guests: {
        Row: {
          booking_id: string
          created_at: string
          email: string | null
          id: string
          name: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_guests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name: string; created_at?: string }
        Update: { id?: string; name?: string; created_at?: string }
        Relationships: []
      }
      organization_memberships: {
        Row: {
          organization_id: string
          status: Database["public"]["Enums"]["membership_status"]
          seat_allowance: number
          starts_at: string | null
          ends_at: string | null
          approved_by: string | null
          updated_at: string
        }
        Insert: {
          organization_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          seat_allowance?: number
          starts_at?: string | null
          ends_at?: string | null
          approved_by?: string | null
          updated_at?: string
        }
        Update: {
          organization_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          seat_allowance?: number
          starts_at?: string | null
          ends_at?: string | null
          approved_by?: string | null
          updated_at?: string
        }
        Relationships: [{
          foreignKeyName: "organization_memberships_organization_id_fkey"
          columns: ["organization_id"]
          isOneToOne: true
          referencedRelation: "organizations"
          referencedColumns: ["id"]
        }]
      }
      team_membership_applications: {
        Row: {
          id: string
          applicant_id: string
          organization_name: string
          contact_name: string
          summary: string
          requested_seats: number
          status: Database["public"]["Enums"]["membership_application_status"]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
        }
        Insert: {
          id?: string
          applicant_id: string
          organization_name: string
          contact_name: string
          summary?: string
          requested_seats: number
          status?: Database["public"]["Enums"]["membership_application_status"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
        }
        Update: {
          id?: string
          applicant_id?: string
          organization_name?: string
          contact_name?: string
          summary?: string
          requested_seats?: number
          status?: Database["public"]["Enums"]["membership_application_status"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          access_source: "personal" | "team"
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          ends_at: string
          id: string
          idempotency_key: string | null
          member_id: string
          notes: string | null
          organization_id: string | null
          resource_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          access_source?: "personal" | "team"
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          ends_at: string
          id?: string
          idempotency_key?: string | null
          member_id: string
          notes?: string | null
          organization_id?: string | null
          resource_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          access_source?: "personal" | "team"
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          idempotency_key?: string | null
          member_id?: string
          notes?: string | null
          organization_id?: string | null
          resource_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinet_access_intents: {
        Row: {
          attendance_session_id: string
          cabinet_device_id: string
          created_at: string
          expires_at: string
          id: string
          member_id: string
          redeemed_at: string | null
          status: Database["public"]["Enums"]["cabinet_access_intent_status"]
          token_hash: string
        }
        Insert: {
          attendance_session_id: string
          cabinet_device_id: string
          created_at?: string
          expires_at: string
          id?: string
          member_id: string
          redeemed_at?: string | null
          status?: Database["public"]["Enums"]["cabinet_access_intent_status"]
          token_hash: string
        }
        Update: {
          attendance_session_id?: string
          cabinet_device_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          member_id?: string
          redeemed_at?: string | null
          status?: Database["public"]["Enums"]["cabinet_access_intent_status"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "cabinet_access_intents_attendance_session_id_fkey"
            columns: ["attendance_session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cabinet_access_intents_cabinet_device_id_fkey"
            columns: ["cabinet_device_id"]
            isOneToOne: false
            referencedRelation: "cabinet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cabinet_access_intents_cabinet_device_id_fkey"
            columns: ["cabinet_device_id"]
            isOneToOne: false
            referencedRelation: "member_active_cabinets"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinet_devices: {
        Row: {
          created_at: string
          enrolled_at: string | null
          id: string
          key_thumbprint: string
          last_seen_at: string | null
          location_id: string
          metadata: Json
          name: string
          public_key_jwk: Json
          revoked_at: string | null
          status: Database["public"]["Enums"]["cabinet_device_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrolled_at?: string | null
          id?: string
          key_thumbprint: string
          last_seen_at?: string | null
          location_id: string
          metadata?: Json
          name: string
          public_key_jwk: Json
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["cabinet_device_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrolled_at?: string | null
          id?: string
          key_thumbprint?: string
          last_seen_at?: string | null
          location_id?: string
          metadata?: Json
          name?: string
          public_key_jwk?: Json
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["cabinet_device_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cabinet_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinet_events: {
        Row: {
          access_intent_id: string | null
          cabinet_device_id: string
          checkout_session_id: string | null
          event_key: string
          event_kind: Database["public"]["Enums"]["cabinet_event_kind"]
          id: string
          occurred_at: string
          payload: Json
          received_at: string
        }
        Insert: {
          access_intent_id?: string | null
          cabinet_device_id: string
          checkout_session_id?: string | null
          event_key: string
          event_kind: Database["public"]["Enums"]["cabinet_event_kind"]
          id?: string
          occurred_at: string
          payload?: Json
          received_at?: string
        }
        Update: {
          access_intent_id?: string | null
          cabinet_device_id?: string
          checkout_session_id?: string | null
          event_key?: string
          event_kind?: Database["public"]["Enums"]["cabinet_event_kind"]
          id?: string
          occurred_at?: string
          payload?: Json
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cabinet_events_access_intent_id_fkey"
            columns: ["access_intent_id"]
            isOneToOne: false
            referencedRelation: "cabinet_access_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cabinet_events_cabinet_device_id_fkey"
            columns: ["cabinet_device_id"]
            isOneToOne: false
            referencedRelation: "cabinet_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cabinet_events_cabinet_device_id_fkey"
            columns: ["cabinet_device_id"]
            isOneToOne: false
            referencedRelation: "member_active_cabinets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cabinet_events_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cabinet_events_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["checkout_session_id"]
          },
        ]
      }
      calendar_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          provider: Database["public"]["Enums"]["calendar_provider"]
          provider_calendar_id: string
          resource_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          provider?: Database["public"]["Enums"]["calendar_provider"]
          provider_calendar_id: string
          resource_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          provider?: Database["public"]["Enums"]["calendar_provider"]
          provider_calendar_id?: string
          resource_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_links_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_links_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_state: {
        Row: {
          booking_id: string
          calendar_link_id: string
          created_at: string
          external_updated_at: string | null
          last_error: string | null
          last_synced_at: string | null
          provider_etag: string | null
          provider_event_id: string | null
          status: Database["public"]["Enums"]["calendar_sync_status"]
          updated_at: string
        }
        Insert: {
          booking_id: string
          calendar_link_id: string
          created_at?: string
          external_updated_at?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          provider_etag?: string | null
          provider_event_id?: string | null
          status?: Database["public"]["Enums"]["calendar_sync_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          calendar_link_id?: string
          created_at?: string
          external_updated_at?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          provider_etag?: string | null
          provider_event_id?: string | null
          status?: Database["public"]["Enums"]["calendar_sync_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_state_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sync_state_calendar_link_id_fkey"
            columns: ["calendar_link_id"]
            isOneToOne: false
            referencedRelation: "calendar_links"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_types: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          slug: string
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: []
      }
      checkin_intents: {
        Row: {
          action: Database["public"]["Enums"]["checkin_action"]
          booking_id: string | null
          created_at: string
          expires_at: string
          id: string
          redeemed_at: string | null
          redeemed_by_device: string | null
          status: Database["public"]["Enums"]["checkin_intent_status"]
          token_hash: string
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["checkin_action"]
          booking_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          redeemed_at?: string | null
          redeemed_by_device?: string | null
          status?: Database["public"]["Enums"]["checkin_intent_status"]
          token_hash: string
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["checkin_action"]
          booking_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          redeemed_at?: string | null
          redeemed_by_device?: string | null
          status?: Database["public"]["Enums"]["checkin_intent_status"]
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_intents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_intents_redeemed_by_device_fkey"
            columns: ["redeemed_by_device"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          attendance_session_id: string
          checked_out_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          location_id: string
          member_id: string
          opened_at: string
          returned_at: string | null
          review_reason: string | null
          status: Database["public"]["Enums"]["checkout_session_status"]
          updated_at: string
        }
        Insert: {
          attendance_session_id: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          location_id: string
          member_id: string
          opened_at?: string
          returned_at?: string | null
          review_reason?: string | null
          status?: Database["public"]["Enums"]["checkout_session_status"]
          updated_at?: string
        }
        Update: {
          attendance_session_id?: string
          checked_out_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          location_id?: string
          member_id?: string
          opened_at?: string
          returned_at?: string | null
          review_reason?: string | null
          status?: Database["public"]["Enums"]["checkout_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_attendance_session_id_fkey"
            columns: ["attendance_session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      component_offers: {
        Row: {
          active: boolean
          checked_on: string
          component_id: string
          created_at: string
          customer_rating: number | null
          customer_rating_count: number | null
          display_price_inr: number | null
          gst_rate: number | null
          id: string
          is_preferred: boolean
          manufacturer_part_number: string | null
          notes: string | null
          order_url: string
          price_inr_excluding_gst: number | null
          price_inr_including_gst: number | null
          rating_source: string | null
          requires_validation: boolean
          sku: string | null
          stock_status: Database["public"]["Enums"]["component_offer_status"]
          updated_at: string
          variant: string
          vendor_name: string
          warranty_note: string | null
        }
        Insert: {
          active?: boolean
          checked_on: string
          component_id: string
          created_at?: string
          customer_rating?: number | null
          customer_rating_count?: number | null
          display_price_inr?: number | null
          gst_rate?: number | null
          id?: string
          is_preferred?: boolean
          manufacturer_part_number?: string | null
          notes?: string | null
          order_url: string
          price_inr_excluding_gst?: number | null
          price_inr_including_gst?: number | null
          rating_source?: string | null
          requires_validation?: boolean
          sku?: string | null
          stock_status?: Database["public"]["Enums"]["component_offer_status"]
          updated_at?: string
          variant?: string
          vendor_name: string
          warranty_note?: string | null
        }
        Update: {
          active?: boolean
          checked_on?: string
          component_id?: string
          created_at?: string
          customer_rating?: number | null
          customer_rating_count?: number | null
          display_price_inr?: number | null
          gst_rate?: number | null
          id?: string
          is_preferred?: boolean
          manufacturer_part_number?: string | null
          notes?: string | null
          order_url?: string
          price_inr_excluding_gst?: number | null
          price_inr_including_gst?: number | null
          rating_source?: string | null
          requires_validation?: boolean
          sku?: string | null
          stock_status?: Database["public"]["Enums"]["component_offer_status"]
          updated_at?: string
          variant?: string
          vendor_name?: string
          warranty_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "component_offers_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_offers_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "public_component_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      component_request_rate_limits: {
        Row: {
          key_hash: string
          request_count: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          key_hash: string
          request_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          key_hash?: string
          request_count?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      component_request_votes: {
        Row: {
          created_at: string
          member_id: string
          request_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          request_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "component_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_request_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "public_component_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      component_requests: {
        Row: {
          budget_band: Database["public"]["Enums"]["component_request_budget"]
          component_name: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          is_published: boolean
          notes: string | null
          project_use_case: string
          requested_quantity: number
          requester_email: string
          requester_user_id: string | null
          status: Database["public"]["Enums"]["component_request_status"]
          updated_at: string
          urgency: Database["public"]["Enums"]["component_request_urgency"]
          vendor_url: string | null
          verification_expires_at: string | null
          verification_token_hash: string | null
          verified_at: string | null
        }
        Insert: {
          budget_band?: Database["public"]["Enums"]["component_request_budget"]
          component_name: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          is_published?: boolean
          notes?: string | null
          project_use_case: string
          requested_quantity?: number
          requester_email: string
          requester_user_id?: string | null
          status?: Database["public"]["Enums"]["component_request_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["component_request_urgency"]
          vendor_url?: string | null
          verification_expires_at?: string | null
          verification_token_hash?: string | null
          verified_at?: string | null
        }
        Update: {
          budget_band?: Database["public"]["Enums"]["component_request_budget"]
          component_name?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          is_published?: boolean
          notes?: string | null
          project_use_case?: string
          requested_quantity?: number
          requester_email?: string
          requester_user_id?: string | null
          status?: Database["public"]["Enums"]["component_request_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["component_request_urgency"]
          vendor_url?: string | null
          verification_expires_at?: string | null
          verification_token_hash?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      components: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string
          id: string
          inventory_kind: Database["public"]["Enums"]["component_inventory_kind"]
          metadata: Json
          name: string
          reorder_threshold: number
          safety_notes: string | null
          slug: string
          target_quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string
          id?: string
          inventory_kind: Database["public"]["Enums"]["component_inventory_kind"]
          metadata?: Json
          name: string
          reorder_threshold?: number
          safety_notes?: string | null
          slug: string
          target_quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string
          id?: string
          inventory_kind?: Database["public"]["Enums"]["component_inventory_kind"]
          metadata?: Json
          name?: string
          reorder_threshold?: number
          safety_notes?: string | null
          slug?: string
          target_quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      consumable_order_items: {
        Row: {
          consumable_sku_id: string
          created_at: string
          order_id: string
          quantity: number
          reference_unit_price_inr_including_gst: number | null
          updated_at: string
        }
        Insert: {
          consumable_sku_id: string
          created_at?: string
          order_id: string
          quantity: number
          reference_unit_price_inr_including_gst?: number | null
          updated_at?: string
        }
        Update: {
          consumable_sku_id?: string
          created_at?: string
          order_id?: string
          quantity?: number
          reference_unit_price_inr_including_gst?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumable_order_items_consumable_sku_id_fkey"
            columns: ["consumable_sku_id"]
            isOneToOne: false
            referencedRelation: "consumable_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_order_items_consumable_sku_id_fkey"
            columns: ["consumable_sku_id"]
            isOneToOne: false
            referencedRelation: "public_consumable_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "consumable_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      consumable_orders: {
        Row: {
          collection_method: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          idempotency_key: string
          member_id: string
          member_notes: string | null
          staff_notes: string | null
          status: Database["public"]["Enums"]["consumable_order_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          collection_method?: string
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          idempotency_key: string
          member_id: string
          member_notes?: string | null
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["consumable_order_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          collection_method?: string
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          idempotency_key?: string
          member_id?: string
          member_notes?: string | null
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["consumable_order_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consumable_skus: {
        Row: {
          active: boolean
          component_id: string
          created_at: string
          description: string
          id: string
          inventory_lot_id: string | null
          metadata: Json
          name: string
          order_unit: string
          quantity_per_order_unit: number
          reference_price_inr_including_gst: number | null
          sku_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          component_id: string
          created_at?: string
          description?: string
          id?: string
          inventory_lot_id?: string | null
          metadata?: Json
          name: string
          order_unit?: string
          quantity_per_order_unit?: number
          reference_price_inr_including_gst?: number | null
          sku_code: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          component_id?: string
          created_at?: string
          description?: string
          id?: string
          inventory_lot_id?: string | null
          metadata?: Json
          name?: string
          order_unit?: string
          quantity_per_order_unit?: number
          reference_price_inr_including_gst?: number | null
          sku_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumable_skus_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_skus_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "public_component_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumable_skus_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_outbox: {
        Row: {
          action: Database["public"]["Enums"]["outbox_action"]
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          updated_at: string
        }
        Insert: {
          action: Database["public"]["Enums"]["outbox_action"]
          aggregate_id: string
          aggregate_type: string
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["outbox_action"]
          aggregate_id?: string
          aggregate_type?: string
          attempt_count?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
        }
        Relationships: []
      }
      inventory_evidence: {
        Row: {
          captured_at: string
          checkout_session_id: string
          created_at: string
          evidence_kind: Database["public"]["Enums"]["inventory_evidence_kind"]
          id: string
          inventory_movement_id: string | null
          metadata: Json
          retain_until: string
          retention_class: Database["public"]["Enums"]["inventory_evidence_retention"]
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          captured_at?: string
          checkout_session_id: string
          created_at?: string
          evidence_kind: Database["public"]["Enums"]["inventory_evidence_kind"]
          id?: string
          inventory_movement_id?: string | null
          metadata?: Json
          retain_until: string
          retention_class?: Database["public"]["Enums"]["inventory_evidence_retention"]
          storage_path: string
          uploaded_by: string
        }
        Update: {
          captured_at?: string
          checkout_session_id?: string
          created_at?: string
          evidence_kind?: Database["public"]["Enums"]["inventory_evidence_kind"]
          id?: string
          inventory_movement_id?: string | null
          metadata?: Json
          retain_until?: string
          retention_class?: Database["public"]["Enums"]["inventory_evidence_retention"]
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_evidence_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_evidence_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["checkout_session_id"]
          },
          {
            foreignKeyName: "inventory_evidence_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_evidence_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["movement_id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          lab_location_id: string | null
          member_visible: boolean
          metadata: Json
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          lab_location_id?: string | null
          member_visible?: boolean
          metadata?: Json
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          lab_location_id?: string | null
          member_visible?: boolean
          metadata?: Json
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_lab_location_id_fkey"
            columns: ["lab_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["inventory_location_id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          component_id: string
          component_offer_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          inventory_location_id: string
          lot_code: string
          metadata: Json
          quantity_on_hand: number
          received_at: string | null
          unit_cost_inr: number | null
          updated_at: string
        }
        Insert: {
          component_id: string
          component_offer_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_location_id: string
          lot_code: string
          metadata?: Json
          quantity_on_hand?: number
          received_at?: string | null
          unit_cost_inr?: number | null
          updated_at?: string
        }
        Update: {
          component_id?: string
          component_offer_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          inventory_location_id?: string
          lot_code?: string
          metadata?: Json
          quantity_on_hand?: number
          received_at?: string | null
          unit_cost_inr?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "public_component_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_component_offer_id_fkey"
            columns: ["component_offer_id"]
            isOneToOne: false
            referencedRelation: "component_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["inventory_location_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_user_id: string | null
          asset_unit_id: string | null
          checkout_session_id: string | null
          closed_at: string | null
          component_id: string
          id: string
          inventory_lot_id: string | null
          metadata: Json
          movement_kind: Database["public"]["Enums"]["inventory_movement_kind"]
          notes: string | null
          occurred_at: string
          quantity_delta: number | null
          source: string
        }
        Insert: {
          actor_user_id?: string | null
          asset_unit_id?: string | null
          checkout_session_id?: string | null
          closed_at?: string | null
          component_id: string
          id?: string
          inventory_lot_id?: string | null
          metadata?: Json
          movement_kind: Database["public"]["Enums"]["inventory_movement_kind"]
          notes?: string | null
          occurred_at?: string
          quantity_delta?: number | null
          source?: string
        }
        Update: {
          actor_user_id?: string | null
          asset_unit_id?: string | null
          checkout_session_id?: string | null
          closed_at?: string | null
          component_id?: string
          id?: string
          inventory_lot_id?: string | null
          metadata?: Json
          movement_kind?: Database["public"]["Enums"]["inventory_movement_kind"]
          notes?: string | null
          occurred_at?: string
          quantity_delta?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_asset_unit_id_fkey"
            columns: ["asset_unit_id"]
            isOneToOne: false
            referencedRelation: "asset_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_asset_unit_id_fkey"
            columns: ["asset_unit_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["asset_unit_id"]
          },
          {
            foreignKeyName: "inventory_movements_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["checkout_session_id"]
          },
          {
            foreignKeyName: "inventory_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "public_component_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_devices: {
        Row: {
          created_at: string
          enrolled_at: string | null
          enrolled_by: string | null
          id: string
          key_thumbprint: string | null
          last_seen_at: string | null
          location_id: string
          name: string
          public_key_jwk: Json | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["kiosk_device_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enrolled_at?: string | null
          enrolled_by?: string | null
          id?: string
          key_thumbprint?: string | null
          last_seen_at?: string | null
          location_id: string
          name: string
          public_key_jwk?: Json | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["kiosk_device_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enrolled_at?: string | null
          enrolled_by?: string | null
          id?: string
          key_thumbprint?: string | null
          last_seen_at?: string | null
          location_id?: string
          name?: string
          public_key_jwk?: Json | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["kiosk_device_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_enrollment_tokens: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          location_id: string
          name: string
          redeemed_at: string | null
          redeemed_device_id: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          location_id: string
          name: string
          redeemed_at?: string | null
          redeemed_device_id?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          location_id?: string
          name?: string
          redeemed_at?: string | null
          redeemed_device_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_enrollment_tokens_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_enrollment_tokens_redeemed_device_id_fkey"
            columns: ["redeemed_device_id"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_request_nonces: {
        Row: {
          device_id: string
          expires_at: string
          nonce: string
          requested_at: string
        }
        Insert: {
          device_id: string
          expires_at: string
          nonce: string
          requested_at?: string
        }
        Update: {
          device_id?: string
          expires_at?: string
          nonce?: string
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_request_nonces_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "kiosk_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      locker_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assignment_period: unknown
          created_at: string
          ends_at: string
          id: string
          idempotency_key: string
          last_extended_at: string | null
          locker_id: string | null
          locker_plan_id: string
          member_id: string
          member_notes: string | null
          release_reason: string | null
          released_at: string | null
          staff_notes: string | null
          starts_at: string
          status: Database["public"]["Enums"]["locker_assignment_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignment_period?: unknown
          created_at?: string
          ends_at: string
          id?: string
          idempotency_key: string
          last_extended_at?: string | null
          locker_id?: string | null
          locker_plan_id: string
          member_id: string
          member_notes?: string | null
          release_reason?: string | null
          released_at?: string | null
          staff_notes?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["locker_assignment_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignment_period?: unknown
          created_at?: string
          ends_at?: string
          id?: string
          idempotency_key?: string
          last_extended_at?: string | null
          locker_id?: string | null
          locker_plan_id?: string
          member_id?: string
          member_notes?: string | null
          release_reason?: string | null
          released_at?: string | null
          staff_notes?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["locker_assignment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locker_assignments_locker_id_fkey"
            columns: ["locker_id"]
            isOneToOne: false
            referencedRelation: "lockers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_assignments_locker_plan_id_fkey"
            columns: ["locker_plan_id"]
            isOneToOne: false
            referencedRelation: "locker_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locker_assignments_locker_plan_id_fkey"
            columns: ["locker_plan_id"]
            isOneToOne: false
            referencedRelation: "public_locker_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      locker_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string
          duration: string
          id: string
          name: string
          offering_slug: string
          period: Database["public"]["Enums"]["locker_plan_period"]
          price_inr_including_gst: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          duration: string
          id?: string
          name: string
          offering_slug: string
          period: Database["public"]["Enums"]["locker_plan_period"]
          price_inr_including_gst?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          duration?: string
          id?: string
          name?: string
          offering_slug?: string
          period?: Database["public"]["Enums"]["locker_plan_period"]
          price_inr_including_gst?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      lockers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          location_id: string
          maintenance_note: string | null
          metadata: Json
          size_label: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          location_id: string
          maintenance_note?: string | null
          metadata?: Json
          size_label?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          location_id?: string
          maintenance_note?: string | null
          metadata?: Json
          size_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lockers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_certifications: {
        Row: {
          certification_type_id: string
          created_at: string
          evidence_path: string | null
          expires_at: string | null
          id: string
          issued_at: string
          issued_by: string
          member_id: string
          notes: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["certification_status"]
          updated_at: string
        }
        Insert: {
          certification_type_id: string
          created_at?: string
          evidence_path?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by: string
          member_id: string
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["certification_status"]
          updated_at?: string
        }
        Update: {
          certification_type_id?: string
          created_at?: string
          evidence_path?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string
          member_id?: string
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["certification_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_certifications_certification_type_id_fkey"
            columns: ["certification_type_id"]
            isOneToOne: false
            referencedRelation: "certification_types"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_applications: {
        Row: {
          applicant_notes: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          id: string
          status: Database["public"]["Enums"]["membership_application_status"]
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_notes?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          status?: Database["public"]["Enums"]["membership_application_status"]
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_notes?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          id?: string
          status?: Database["public"]["Enums"]["membership_application_status"]
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          ends_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          suspended_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          ends_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          suspended_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          ends_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          suspended_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          display_name: string
          emergency_contact: Json | null
          handle: string | null
          id: string
          is_public: boolean
          organization: string | null
          phone: string | null
          project_links: Json
          skills: string[]
          social_links: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          emergency_contact?: Json | null
          handle?: string | null
          id: string
          is_public?: boolean
          organization?: string | null
          phone?: string | null
          project_links?: Json
          skills?: string[]
          social_links?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          emergency_contact?: Json | null
          handle?: string | null
          id?: string
          is_public?: boolean
          organization?: string | null
          phone?: string | null
          project_links?: Json
          skills?: string[]
          social_links?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_components: {
        Row: {
          component_id: string
          created_at: string
          notes: string | null
          project_slug: string
          quantity_per_build: number | null
          requirement_kind: Database["public"]["Enums"]["component_requirement_kind"]
        }
        Insert: {
          component_id: string
          created_at?: string
          notes?: string | null
          project_slug: string
          quantity_per_build?: number | null
          requirement_kind: Database["public"]["Enums"]["component_requirement_kind"]
        }
        Update: {
          component_id?: string
          created_at?: string
          notes?: string | null
          project_slug?: string
          quantity_per_build?: number | null
          requirement_kind?: Database["public"]["Enums"]["component_requirement_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "project_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "public_component_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_deliveries: {
        Row: {
          attempt_count: number
          booking_id: string
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          reminder_kind: string
          scheduled_for: string
          status: Database["public"]["Enums"]["reminder_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          booking_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          reminder_kind: string
          scheduled_for: string
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          booking_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          reminder_kind?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["reminder_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_deliveries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_blocks: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          ends_at: string
          id: string
          kind: Database["public"]["Enums"]["resource_block_kind"]
          reason: string
          resource_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          kind: Database["public"]["Enums"]["resource_block_kind"]
          reason: string
          resource_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["resource_block_kind"]
          reason?: string
          resource_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_blocks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_blocks_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_certification_requirements: {
        Row: {
          certification_type_id: string
          created_at: string
          resource_id: string
        }
        Insert: {
          certification_type_id: string
          created_at?: string
          resource_id: string
        }
        Update: {
          certification_type_id?: string
          created_at?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_certification_requirements_certification_type_id_fkey"
            columns: ["certification_type_id"]
            isOneToOne: false
            referencedRelation: "certification_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_certification_requirements_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_certification_requirements_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_hours: {
        Row: {
          closes_at: string
          created_at: string
          day_of_week: number
          effective_from: string | null
          effective_until: string | null
          id: string
          opens_at: string
          resource_id: string
          updated_at: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          day_of_week: number
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          opens_at: string
          resource_id: string
          updated_at?: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          day_of_week?: number
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          opens_at?: string
          resource_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_hours_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_hours_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_reservations: {
        Row: {
          block_id: string | null
          booking_id: string | null
          created_at: string
          ends_at: string
          id: string
          kind: Database["public"]["Enums"]["reservation_kind"]
          period: unknown
          released_at: string | null
          resource_id: string
          starts_at: string
        }
        Insert: {
          block_id?: string | null
          booking_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          kind: Database["public"]["Enums"]["reservation_kind"]
          period?: unknown
          released_at?: string | null
          resource_id: string
          starts_at: string
        }
        Update: {
          block_id?: string | null
          booking_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["reservation_kind"]
          period?: unknown
          released_at?: string | null
          resource_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_reservations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: true
            referencedRelation: "resource_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          active: boolean
          booking_horizon_days: number
          capacity: number
          checkin_early_minutes: number
          checkin_late_minutes: number
          checkout_grace_minutes: number
          created_at: string
          default_duration_minutes: number
          description: string
          guests_allowed: boolean
          id: string
          image_url: string | null
          increment_minutes: number
          kind: Database["public"]["Enums"]["resource_kind"]
          location_id: string
          max_duration_minutes: number
          max_guests: number
          metadata: Json
          name: string
          reservable: boolean
          risk: Database["public"]["Enums"]["resource_risk"]
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          booking_horizon_days?: number
          capacity?: number
          checkin_early_minutes?: number
          checkin_late_minutes?: number
          checkout_grace_minutes?: number
          created_at?: string
          default_duration_minutes?: number
          description?: string
          guests_allowed?: boolean
          id?: string
          image_url?: string | null
          increment_minutes?: number
          kind: Database["public"]["Enums"]["resource_kind"]
          location_id: string
          max_duration_minutes?: number
          max_guests?: number
          metadata?: Json
          name: string
          reservable?: boolean
          risk?: Database["public"]["Enums"]["resource_risk"]
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          booking_horizon_days?: number
          capacity?: number
          checkin_early_minutes?: number
          checkin_late_minutes?: number
          checkout_grace_minutes?: number
          created_at?: string
          default_duration_minutes?: number
          description?: string
          guests_allowed?: boolean
          id?: string
          image_url?: string | null
          increment_minutes?: number
          kind?: Database["public"]["Enums"]["resource_kind"]
          location_id?: string
          max_duration_minutes?: number
          max_guests?: number
          metadata?: Json
          name?: string
          reservable?: boolean
          risk?: Database["public"]["Enums"]["resource_risk"]
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: []
      }
      toolkit_condition_evidence: {
        Row: {
          captured_at: string
          created_at: string
          evidence_phase: Database["public"]["Enums"]["toolkit_evidence_phase"]
          id: string
          metadata: Json
          retain_until: string
          retention_class: Database["public"]["Enums"]["inventory_evidence_retention"]
          storage_path: string
          toolkit_item_id: string | null
          toolkit_rental_session_id: string
          uploaded_by: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          evidence_phase: Database["public"]["Enums"]["toolkit_evidence_phase"]
          id?: string
          metadata?: Json
          retain_until: string
          retention_class?: Database["public"]["Enums"]["inventory_evidence_retention"]
          storage_path: string
          toolkit_item_id?: string | null
          toolkit_rental_session_id: string
          uploaded_by: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          evidence_phase?: Database["public"]["Enums"]["toolkit_evidence_phase"]
          id?: string
          metadata?: Json
          retain_until?: string
          retention_class?: Database["public"]["Enums"]["inventory_evidence_retention"]
          storage_path?: string
          toolkit_item_id?: string | null
          toolkit_rental_session_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolkit_condition_evidence_toolkit_item_id_fkey"
            columns: ["toolkit_item_id"]
            isOneToOne: false
            referencedRelation: "toolkit_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_condition_evidence_toolkit_rental_session_id_fkey"
            columns: ["toolkit_rental_session_id"]
            isOneToOne: false
            referencedRelation: "toolkit_rental_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      toolkit_items: {
        Row: {
          condition_note: string | null
          created_at: string
          id: string
          item_tag: string
          metadata: Json
          name: string
          required: boolean
          serial_number: string | null
          status: Database["public"]["Enums"]["toolkit_item_status"]
          template_item_id: string | null
          toolkit_kit_id: string
          updated_at: string
        }
        Insert: {
          condition_note?: string | null
          created_at?: string
          id?: string
          item_tag: string
          metadata?: Json
          name: string
          required?: boolean
          serial_number?: string | null
          status?: Database["public"]["Enums"]["toolkit_item_status"]
          template_item_id?: string | null
          toolkit_kit_id: string
          updated_at?: string
        }
        Update: {
          condition_note?: string | null
          created_at?: string
          id?: string
          item_tag?: string
          metadata?: Json
          name?: string
          required?: boolean
          serial_number?: string | null
          status?: Database["public"]["Enums"]["toolkit_item_status"]
          template_item_id?: string | null
          toolkit_kit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolkit_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "toolkit_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_items_toolkit_kit_id_fkey"
            columns: ["toolkit_kit_id"]
            isOneToOne: false
            referencedRelation: "toolkit_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      toolkit_kits: {
        Row: {
          condition_note: string | null
          created_at: string
          id: string
          inventory_location_id: string
          kit_tag: string
          metadata: Json
          status: Database["public"]["Enums"]["toolkit_kit_status"]
          toolkit_template_id: string
          updated_at: string
        }
        Insert: {
          condition_note?: string | null
          created_at?: string
          id?: string
          inventory_location_id: string
          kit_tag: string
          metadata?: Json
          status?: Database["public"]["Enums"]["toolkit_kit_status"]
          toolkit_template_id: string
          updated_at?: string
        }
        Update: {
          condition_note?: string | null
          created_at?: string
          id?: string
          inventory_location_id?: string
          kit_tag?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["toolkit_kit_status"]
          toolkit_template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolkit_kits_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_kits_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "member_checkout_assets"
            referencedColumns: ["inventory_location_id"]
          },
          {
            foreignKeyName: "toolkit_kits_toolkit_template_id_fkey"
            columns: ["toolkit_template_id"]
            isOneToOne: false
            referencedRelation: "public_toolkit_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_kits_toolkit_template_id_fkey"
            columns: ["toolkit_template_id"]
            isOneToOne: false
            referencedRelation: "toolkit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      toolkit_rental_items: {
        Row: {
          checked_out_at: string
          checkout_condition_note: string | null
          created_at: string
          return_condition_note: string | null
          returned_at: string | null
          toolkit_item_id: string
          toolkit_rental_session_id: string
          updated_at: string
        }
        Insert: {
          checked_out_at?: string
          checkout_condition_note?: string | null
          created_at?: string
          return_condition_note?: string | null
          returned_at?: string | null
          toolkit_item_id: string
          toolkit_rental_session_id: string
          updated_at?: string
        }
        Update: {
          checked_out_at?: string
          checkout_condition_note?: string | null
          created_at?: string
          return_condition_note?: string | null
          returned_at?: string | null
          toolkit_item_id?: string
          toolkit_rental_session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolkit_rental_items_toolkit_item_id_fkey"
            columns: ["toolkit_item_id"]
            isOneToOne: false
            referencedRelation: "toolkit_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_rental_items_toolkit_rental_session_id_fkey"
            columns: ["toolkit_rental_session_id"]
            isOneToOne: false
            referencedRelation: "toolkit_rental_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      toolkit_rental_sessions: {
        Row: {
          attendance_session_id: string
          checked_out_at: string | null
          checkout_condition_note: string | null
          created_at: string
          id: string
          idempotency_key: string
          member_id: string
          opened_at: string
          requested_period: string
          return_condition_note: string | null
          returned_at: string | null
          review_reason: string | null
          status: Database["public"]["Enums"]["toolkit_rental_status"]
          toolkit_kit_id: string
          updated_at: string
        }
        Insert: {
          attendance_session_id: string
          checked_out_at?: string | null
          checkout_condition_note?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          member_id: string
          opened_at?: string
          requested_period: string
          return_condition_note?: string | null
          returned_at?: string | null
          review_reason?: string | null
          status?: Database["public"]["Enums"]["toolkit_rental_status"]
          toolkit_kit_id: string
          updated_at?: string
        }
        Update: {
          attendance_session_id?: string
          checked_out_at?: string | null
          checkout_condition_note?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          member_id?: string
          opened_at?: string
          requested_period?: string
          return_condition_note?: string | null
          returned_at?: string | null
          review_reason?: string | null
          status?: Database["public"]["Enums"]["toolkit_rental_status"]
          toolkit_kit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolkit_rental_sessions_attendance_session_id_fkey"
            columns: ["attendance_session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_rental_sessions_toolkit_kit_id_fkey"
            columns: ["toolkit_kit_id"]
            isOneToOne: false
            referencedRelation: "toolkit_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      toolkit_template_items: {
        Row: {
          component_id: string | null
          created_at: string
          display_order: number
          id: string
          item_name: string
          notes: string | null
          quantity: number
          required: boolean
          toolkit_template_id: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          item_name: string
          notes?: string | null
          quantity?: number
          required?: boolean
          toolkit_template_id: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          item_name?: string
          notes?: string | null
          quantity?: number
          required?: boolean
          toolkit_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolkit_template_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_template_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "public_component_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_template_items_toolkit_template_id_fkey"
            columns: ["toolkit_template_id"]
            isOneToOne: false
            referencedRelation: "public_toolkit_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolkit_template_items_toolkit_template_id_fkey"
            columns: ["toolkit_template_id"]
            isOneToOne: false
            referencedRelation: "toolkit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      toolkit_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          safety_notes: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          safety_notes?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          safety_notes?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      member_active_cabinets: {
        Row: {
          id: string | null
          last_seen_at: string | null
          location_id: string | null
          location_name: string | null
          name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cabinet_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_checkout_assets: {
        Row: {
          asset_status: Database["public"]["Enums"]["asset_unit_status"] | null
          asset_tag: string | null
          asset_unit_id: string | null
          checked_out_at: string | null
          checkout_session_id: string | null
          checkout_status:
            | Database["public"]["Enums"]["checkout_session_status"]
            | null
          closed_at: string | null
          component_name: string | null
          component_slug: string | null
          condition_note: string | null
          inventory_location_id: string | null
          location_code: string | null
          location_name: string | null
          member_id: string | null
          movement_id: string | null
          occurred_at: string | null
          opened_at: string | null
          returned_at: string | null
        }
        Relationships: []
      }
      member_component_inventory: {
        Row: {
          available_quantity: number | null
          component_id: string | null
          inventory_kind:
            | Database["public"]["Enums"]["component_inventory_kind"]
            | null
          inventory_location_id: string | null
          location_code: string | null
          location_name: string | null
          name: string | null
          slug: string | null
          unit: string | null
        }
        Relationships: []
      }
      public_component_catalog: {
        Row: {
          category: string | null
          description: string | null
          id: string | null
          inventory_kind:
            | Database["public"]["Enums"]["component_inventory_kind"]
            | null
          name: string | null
          slug: string | null
          stock_status: string | null
          target_quantity: number | null
          unit: string | null
        }
        Relationships: []
      }
      public_component_requests: {
        Row: {
          budget_band:
            | Database["public"]["Enums"]["component_request_budget"]
            | null
          component_name: string | null
          created_at: string | null
          id: string | null
          notes: string | null
          project_use_case: string | null
          requested_quantity: number | null
          status: Database["public"]["Enums"]["component_request_status"] | null
          urgency:
            | Database["public"]["Enums"]["component_request_urgency"]
            | null
          vendor_url: string | null
          verified_at: string | null
          vote_count: number | null
        }
        Relationships: []
      }
      public_consumable_catalog: {
        Row: {
          availability_status: string | null
          description: string | null
          id: string | null
          name: string | null
          order_unit: string | null
          quantity_per_order_unit: number | null
          reference_price_inr_including_gst: number | null
          sku_code: string | null
        }
        Relationships: []
      }
      public_locker_catalog: {
        Row: {
          availability_status: string | null
          description: string | null
          duration: string | null
          id: string | null
          name: string | null
          offering_slug: string | null
          period: Database["public"]["Enums"]["locker_plan_period"] | null
          price_inr_including_gst: number | null
          slug: string | null
        }
        Relationships: []
      }
      public_member_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          handle: string | null
          id: string | null
          organization: string | null
          project_links: Json | null
          skills: string[] | null
          social_links: Json | null
        }
        Relationships: []
      }
      public_resource_certifications: {
        Row: {
          description: string | null
          name: string | null
          resource_id: string | null
          slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_certification_requirements_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_certification_requirements_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      public_resource_hours: {
        Row: {
          closes_at: string | null
          day_of_week: number | null
          effective_from: string | null
          effective_until: string | null
          opens_at: string | null
          resource_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_hours_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "public_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_hours_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      public_resources: {
        Row: {
          booking_horizon_days: number | null
          capacity: number | null
          default_duration_minutes: number | null
          description: string | null
          guests_allowed: boolean | null
          id: string | null
          image_url: string | null
          increment_minutes: number | null
          kind: Database["public"]["Enums"]["resource_kind"] | null
          location_name: string | null
          location_slug: string | null
          max_duration_minutes: number | null
          max_guests: number | null
          name: string | null
          reservable: boolean | null
          risk: Database["public"]["Enums"]["resource_risk"] | null
          slug: string | null
          timezone: string | null
          zone: string | null
        }
        Relationships: []
      }
      public_toolkit_catalog: {
        Row: {
          availability_status: string | null
          description: string | null
          id: string | null
          items: Json | null
          name: string | null
          safety_notes: string | null
          slug: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_toolkit_rental_item: {
        Args: {
          p_checkout_condition_note?: string
          p_item_tag: string
          p_toolkit_rental_session_id: string
        }
        Returns: string
      }
      adjust_inventory_stock: {
        Args: {
          p_inventory_lot_id: string
          p_quantity_delta: number
          p_reason: string
        }
        Returns: number
      }
      assign_locker_subscription: {
        Args: { p_assignment_id: string; p_locker_unit_id: string }
        Returns: string
      }
      begin_inventory_checkout: {
        Args: { p_attendance_session_id: string; p_idempotency_key: string }
        Returns: string
      }
      cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: string
      }
      claim_due_reminders: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          booking_id: string
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          reminder_kind: string
          scheduled_for: string
          status: Database["public"]["Enums"]["reminder_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reminder_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_integration_outbox: {
        Args: { p_limit?: number; p_worker: string }
        Returns: {
          action: Database["public"]["Enums"]["outbox_action"]
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_integration_outbox: {
        Args: { p_id: string }
        Returns: undefined
      }
      complete_inventory_checkout: {
        Args: { p_checkout_session_id: string }
        Returns: string
      }
      complete_reminder: { Args: { p_id: string }; Returns: undefined }
      complete_toolkit_rental: {
        Args: { p_toolkit_rental_session_id: string }
        Returns: string
      }
      consume_component_request_rate_limit: {
        Args: {
          p_key_hash: string
          p_limit?: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      create_booking: {
        Args: {
          p_ends_at: string
          p_guest_names?: string[]
          p_idempotency_key?: string
          p_notes?: string
          p_resource_id: string
          p_starts_at: string
        }
        Returns: string
      }
      create_booking_with_access: {
        Args: {
          p_resource_id: string
          p_starts_at: string
          p_ends_at: string
          p_guest_names: string[]
          p_notes: string
          p_idempotency_key: string
          p_access_source: "personal" | "team"
          p_organization_id: string | null
        }
        Returns: string
      }
      list_my_team_access: {
        Args: Record<PropertyKey, never>
        Returns: {
          organization_id: string
          organization_name: string
          role: string
          seat_enabled: boolean
          membership_active: boolean
          starts_at: string | null
          ends_at: string | null
        }[]
      }
      submit_team_application: {
        Args: { p_organization_name: string; p_contact_name: string; p_summary: string; p_requested_seats: number }
        Returns: string
      }
      team_create_invitation: {
        Args: { p_organization_id: string; p_email: string }
        Returns: Json
      }
      team_accept_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      team_revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      team_remove_member: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: undefined
      }
      team_set_admin_seat: {
        Args: { p_organization_id: string; p_seat_enabled: boolean }
        Returns: undefined
      }
      list_team_roster: {
        Args: { p_organization_id: string }
        Returns: { user_id: string; display_name: string; role: string; seat_enabled: boolean; joined_at: string }[]
      }
      list_team_invitations: {
        Args: { p_organization_id: string }
        Returns: { invitation_id: string; email: string; expires_at: string }[]
      }
      list_team_usage: {
        Args: { p_organization_id: string }
        Returns: { member_id: string; display_name: string; resource_name: string; starts_at: string; ends_at: string; usage_hours: number; attended_hours: number }[]
      }
      get_team_capacity: {
        Args: { p_organization_id: string }
        Returns: { seat_allowance: number; occupied_seats: number; pending_invitations: number }[]
      }
      staff_decide_team_application: {
        Args: { p_application_id: string; p_approve: boolean; p_notes: string; p_starts_at: string | null; p_ends_at: string | null }
        Returns: string | null
      }
      staff_create_team: {
        Args: { p_organization_name: string; p_admin_user_id: string; p_seat_allowance: number; p_starts_at: string | null; p_ends_at: string | null }
        Returns: string
      }
      staff_set_team_membership: {
        Args: { p_organization_id: string; p_status: Database["public"]["Enums"]["membership_status"]; p_seat_allowance: number; p_starts_at: string | null; p_ends_at: string | null }
        Returns: undefined
      }
      staff_transfer_team_admin: {
        Args: { p_organization_id: string; p_new_admin_user_id: string }
        Returns: undefined
      }
      create_cabinet_access_intent: {
        Args: { p_cabinet_device_id: string }
        Returns: Json
      }
      create_checkin_intent: {
        Args: {
          p_action?: Database["public"]["Enums"]["checkin_action"]
          p_booking_id?: string
        }
        Returns: Json
      }
      create_consumable_order: { Args: { p_lines: Json }; Returns: string }
      create_consumable_order_draft: {
        Args: { p_idempotency_key: string; p_member_notes?: string }
        Returns: string
      }
      create_kiosk_enrollment: {
        Args: {
          p_created_by: string
          p_expires_at: string
          p_location_id: string
          p_name: string
          p_token_hash_hex: string
        }
        Returns: string
      }
      create_public_component_request: {
        Args: {
          p_budget_band: Database["public"]["Enums"]["component_request_budget"]
          p_component_name: string
          p_notes?: string
          p_project_use_case: string
          p_requested_quantity: number
          p_requester_email: string
          p_requester_user_id?: string
          p_urgency: Database["public"]["Enums"]["component_request_urgency"]
          p_vendor_url: string
        }
        Returns: Json
      }
      create_resource_block: {
        Args: {
          p_ends_at: string
          p_kind: Database["public"]["Enums"]["resource_block_kind"]
          p_reason: string
          p_resource_id: string
          p_starts_at: string
        }
        Returns: string
      }
      decide_membership: {
        Args: {
          p_application_id: string
          p_decision: Database["public"]["Enums"]["membership_application_status"]
          p_notes?: string
        }
        Returns: string
      }
      extend_locker_subscription: {
        Args: {
          p_assignment_id: string
          p_plan_term: Database["public"]["Enums"]["locker_plan_period"]
        }
        Returns: string
      }
      fail_integration_outbox: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      fail_reminder: {
        Args: { p_error: string; p_id: string }
        Returns: undefined
      }
      fulfill_consumable_order: {
        Args: { p_order_id: string; p_staff_notes?: string }
        Returns: string
      }
      has_staff_role: {
        Args: { p_roles?: Database["public"]["Enums"]["staff_role"][] }
        Returns: boolean
      }
      issue_certification: {
        Args: {
          p_certification_type_id: string
          p_evidence_path?: string
          p_expires_at?: string
          p_member_id: string
          p_notes?: string
        }
        Returns: string
      }
      list_availability: {
        Args: {
          p_duration_minutes?: number
          p_from: string
          p_resource_id: string
          p_to: string
        }
        Returns: {
          available: boolean
          ends_at: string
          reason: string
          starts_at: string
        }[]
      }
      record_cabinet_event: {
        Args: {
          p_access_intent_id?: string
          p_cabinet_device_id: string
          p_checkout_session_id?: string
          p_event_key: string
          p_event_kind: Database["public"]["Enums"]["cabinet_event_kind"]
          p_occurred_at: string
          p_payload?: Json
        }
        Returns: string
      }
      redeem_cabinet_access_intent: {
        Args: {
          p_cabinet_device_id: string
          p_event_key: string
          p_token_hash_hex: string
        }
        Returns: Json
      }
      redeem_checkin_intent: {
        Args: { p_device_id: string; p_token_hash_hex: string }
        Returns: Json
      }
      redeem_kiosk_enrollment: {
        Args: {
          p_key_thumbprint: string
          p_public_key_jwk: Json
          p_token_hash_hex: string
        }
        Returns: Json
      }
      release_locker_subscription: {
        Args: { p_assignment_id: string }
        Returns: string
      }
      request_locker_subscription: {
        Args: {
          p_locker_offering_slug: string
          p_plan_term: Database["public"]["Enums"]["locker_plan_period"]
        }
        Returns: string
      }
      reschedule_booking: {
        Args: {
          p_booking_id: string
          p_ends_at: string
          p_expected_updated_at?: string
          p_starts_at: string
        }
        Returns: string
      }
      return_inventory_asset: {
        Args: {
          p_asset_tag: string
          p_checkout_session_id: string
          p_condition_note?: string
        }
        Returns: string
      }
      return_toolkit_rental: {
        Args: { p_condition_note?: string; p_rental_id: string }
        Returns: string
      }
      run_attendance_maintenance: { Args: never; Returns: Json }
      scan_checkout_asset: {
        Args: { p_asset_tag: string; p_checkout_session_id: string }
        Returns: string
      }
      set_component_request_status: {
        Args: {
          p_decision_note?: string
          p_request_id: string
          p_status: Database["public"]["Enums"]["component_request_status"]
        }
        Returns: Database["public"]["Enums"]["component_request_status"]
      }
      set_consumable_order_item: {
        Args: {
          p_consumable_sku_id: string
          p_order_id: string
          p_quantity: number
        }
        Returns: string
      }
      set_consumable_order_status: {
        Args: {
          p_order_id: string
          p_status: Database["public"]["Enums"]["consumable_order_status"]
        }
        Returns: string
      }
      set_resource_hours: {
        Args: {
          p_closes_at?: string
          p_day_of_week: number
          p_opens_at?: string
          p_resource_id: string
        }
        Returns: string
      }
      staff_override_attendance: {
        Args: {
          p_action: Database["public"]["Enums"]["checkin_action"]
          p_booking_id: string
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      staff_set_booking_status: {
        Args: {
          p_booking_id: string
          p_reason: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: string
      }
      start_toolkit_rental: {
        Args: { p_period: string; p_toolkit_template_slug: string }
        Returns: string
      }
      submit_application: {
        Args: {
          p_applicant_notes?: string
          p_bio?: string
          p_display_name: string
          p_emergency_contact?: Json
          p_handle: string
          p_organization?: string
          p_phone?: string
          p_project_links?: Json
          p_skills?: string[]
          p_social_links?: Json
        }
        Returns: string
      }
      submit_consumable_order: { Args: { p_order_id: string }; Returns: string }
      verify_component_request: {
        Args: { p_request_id: string; p_verification_token: string }
        Returns: string
      }
      vote_component_request: {
        Args: { p_enabled?: boolean; p_request_id: string }
        Returns: number
      }
    }
    Enums: {
      access_event_type:
        | "check_in"
        | "check_out"
        | "auto_close"
        | "denied"
        | "staff_override"
        | "kiosk_enrolled"
        | "kiosk_revoked"
      asset_unit_status:
        | "available"
        | "checked_out"
        | "maintenance"
        | "retired"
        | "lost"
      attendance_status: "active" | "closed" | "auto_closed" | "review"
      audit_actor_type: "member" | "staff" | "kiosk" | "system"
      booking_status:
        | "tentative"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
      cabinet_access_intent_status:
        | "pending"
        | "redeemed"
        | "expired"
        | "cancelled"
      cabinet_device_status: "pending" | "active" | "revoked"
      cabinet_event_kind:
        | "access_granted"
        | "access_denied"
        | "door_opened"
        | "door_closed"
        | "rfid_observed"
        | "weight_observed"
        | "evidence_captured"
        | "reconciliation_required"
      calendar_provider: "google"
      calendar_sync_status: "pending" | "synced" | "failed" | "deleted"
      certification_status: "active" | "revoked"
      checkin_action: "check_in" | "check_out"
      checkin_intent_status: "pending" | "redeemed" | "expired" | "cancelled"
      checkout_session_status:
        | "open"
        | "checked_out"
        | "returned"
        | "cancelled"
        | "review"
      component_inventory_kind:
        | "fixed_bookable"
        | "serialized_reusable"
        | "reusable_tray"
        | "consumable"
      component_offer_status:
        | "in_stock"
        | "limited"
        | "out_of_stock"
        | "validate_before_po"
        | "unknown"
      component_request_budget:
        | "under_2500"
        | "2500_to_10000"
        | "10000_to_50000"
        | "over_50000"
        | "unknown"
      component_request_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "ordered"
        | "available"
        | "declined"
      component_request_urgency:
        | "nice_to_have"
        | "soon"
        | "project_blocking"
        | "safety"
      component_requirement_kind: "required" | "optional" | "alternative"
      consumable_order_status:
        | "draft"
        | "submitted"
        | "approved"
        | "ready"
        | "fulfilled"
        | "declined"
        | "cancelled"
      inventory_evidence_kind: "checkout" | "return" | "cabinet" | "discrepancy"
      inventory_evidence_retention: "routine" | "flagged"
      inventory_movement_kind:
        | "stock_adjustment"
        | "checkout"
        | "return"
        | "cabinet_observation"
        | "correction"
      kiosk_device_status: "pending" | "active" | "revoked"
      locker_assignment_status:
        | "requested"
        | "reserved"
        | "active"
        | "released"
        | "expired"
        | "cancelled"
      locker_plan_period: "week" | "month" | "year"
      membership_application_status:
        | "pending"
        | "approved"
        | "rejected"
        | "withdrawn"
      membership_status:
        | "pending"
        | "active"
        | "suspended"
        | "expired"
        | "cancelled"
      outbox_action: "create" | "update" | "cancel" | "remind"
      outbox_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "dead_letter"
      reminder_status: "pending" | "processing" | "sent" | "failed" | "skipped"
      reservation_kind: "booking" | "block"
      resource_block_kind: "maintenance" | "closure" | "staff_hold"
      resource_kind:
        | "workspace"
        | "equipment"
        | "room"
        | "compute"
        | "mobile_robot"
        | "sensor"
        | "other"
      resource_risk: "low" | "controlled" | "hazardous"
      staff_role: "operations" | "safety" | "admin" | "super_admin"
      toolkit_evidence_phase: "checkout" | "return" | "discrepancy"
      toolkit_item_status:
        | "available"
        | "checked_out"
        | "maintenance"
        | "retired"
        | "missing"
      toolkit_kit_status:
        | "available"
        | "reserved"
        | "rented"
        | "maintenance"
        | "retired"
      toolkit_rental_status:
        | "open"
        | "checked_out"
        | "returned"
        | "cancelled"
        | "review"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_event_type: [
        "check_in",
        "check_out",
        "auto_close",
        "denied",
        "staff_override",
        "kiosk_enrolled",
        "kiosk_revoked",
      ],
      asset_unit_status: [
        "available",
        "checked_out",
        "maintenance",
        "retired",
        "lost",
      ],
      attendance_status: ["active", "closed", "auto_closed", "review"],
      audit_actor_type: ["member", "staff", "kiosk", "system"],
      booking_status: [
        "tentative",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      cabinet_access_intent_status: [
        "pending",
        "redeemed",
        "expired",
        "cancelled",
      ],
      cabinet_device_status: ["pending", "active", "revoked"],
      cabinet_event_kind: [
        "access_granted",
        "access_denied",
        "door_opened",
        "door_closed",
        "rfid_observed",
        "weight_observed",
        "evidence_captured",
        "reconciliation_required",
      ],
      calendar_provider: ["google"],
      calendar_sync_status: ["pending", "synced", "failed", "deleted"],
      certification_status: ["active", "revoked"],
      checkin_action: ["check_in", "check_out"],
      checkin_intent_status: ["pending", "redeemed", "expired", "cancelled"],
      checkout_session_status: [
        "open",
        "checked_out",
        "returned",
        "cancelled",
        "review",
      ],
      component_inventory_kind: [
        "fixed_bookable",
        "serialized_reusable",
        "reusable_tray",
        "consumable",
      ],
      component_offer_status: [
        "in_stock",
        "limited",
        "out_of_stock",
        "validate_before_po",
        "unknown",
      ],
      component_request_budget: [
        "under_2500",
        "2500_to_10000",
        "10000_to_50000",
        "over_50000",
        "unknown",
      ],
      component_request_status: [
        "submitted",
        "under_review",
        "approved",
        "ordered",
        "available",
        "declined",
      ],
      component_request_urgency: [
        "nice_to_have",
        "soon",
        "project_blocking",
        "safety",
      ],
      component_requirement_kind: ["required", "optional", "alternative"],
      consumable_order_status: [
        "draft",
        "submitted",
        "approved",
        "ready",
        "fulfilled",
        "declined",
        "cancelled",
      ],
      inventory_evidence_kind: ["checkout", "return", "cabinet", "discrepancy"],
      inventory_evidence_retention: ["routine", "flagged"],
      inventory_movement_kind: [
        "stock_adjustment",
        "checkout",
        "return",
        "cabinet_observation",
        "correction",
      ],
      kiosk_device_status: ["pending", "active", "revoked"],
      locker_assignment_status: [
        "requested",
        "reserved",
        "active",
        "released",
        "expired",
        "cancelled",
      ],
      locker_plan_period: ["week", "month", "year"],
      membership_application_status: [
        "pending",
        "approved",
        "rejected",
        "withdrawn",
      ],
      membership_status: [
        "pending",
        "active",
        "suspended",
        "expired",
        "cancelled",
      ],
      outbox_action: ["create", "update", "cancel", "remind"],
      outbox_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "dead_letter",
      ],
      reminder_status: ["pending", "processing", "sent", "failed", "skipped"],
      reservation_kind: ["booking", "block"],
      resource_block_kind: ["maintenance", "closure", "staff_hold"],
      resource_kind: [
        "workspace",
        "equipment",
        "room",
        "compute",
        "mobile_robot",
        "sensor",
        "other",
      ],
      resource_risk: ["low", "controlled", "hazardous"],
      staff_role: ["operations", "safety", "admin", "super_admin"],
      toolkit_evidence_phase: ["checkout", "return", "discrepancy"],
      toolkit_item_status: [
        "available",
        "checked_out",
        "maintenance",
        "retired",
        "missing",
      ],
      toolkit_kit_status: [
        "available",
        "reserved",
        "rented",
        "maintenance",
        "retired",
      ],
      toolkit_rental_status: [
        "open",
        "checked_out",
        "returned",
        "cancelled",
        "review",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
