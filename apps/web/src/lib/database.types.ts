export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_assessment_detail: {
        Row: {
          assessment_id: string;
          batch_ids: string[];
          cache_creation_input_tokens: number;
          cache_read_input_tokens: number;
          config_key: string;
          cost_usd: number;
          created_at: string;
          final_model: string;
          final_stage: number;
          flags: string[];
          input_tokens: number;
          models: string[];
          org_id: string;
          output_tokens: number;
          parcel_id: string;
          prompt_version: string;
          review_reasons: string[];
          session_id: string;
          tree_id: string;
          tree_visible: string;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          batch_ids?: string[];
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
          config_key: string;
          cost_usd?: number;
          created_at?: string;
          final_model: string;
          final_stage: number;
          flags?: string[];
          input_tokens?: number;
          models: string[];
          org_id: string;
          output_tokens?: number;
          parcel_id: string;
          prompt_version: string;
          review_reasons?: string[];
          session_id: string;
          tree_id: string;
          tree_visible: string;
        };
        Update: {
          assessment_id?: string;
          batch_ids?: string[];
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
          config_key?: string;
          cost_usd?: number;
          created_at?: string;
          final_model?: string;
          final_stage?: number;
          flags?: string[];
          input_tokens?: number;
          models?: string[];
          org_id?: string;
          output_tokens?: number;
          parcel_id?: string;
          prompt_version?: string;
          review_reasons?: string[];
          session_id?: string;
          tree_id?: string;
          tree_visible?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_assessment_detail_assessment_id_parcel_id_org_id_fkey";
            columns: ["assessment_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "assessment";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "ai_assessment_detail_assessment_id_parcel_id_org_id_fkey";
            columns: ["assessment_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree_latest_assessment";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "ai_assessment_detail_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "ai_assessment_detail_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      application_garden: {
        Row: {
          application_id: string;
          boundary: unknown;
          created_at: string;
          customer_user_id: string;
          declared_area_m2: number;
          district: string | null;
          estimated_tree_count: number | null;
          id: string;
          irrigation: Database["public"]["Enums"]["irrigation_type"];
          name: string;
          org_id: string;
          parcel_id: string | null;
          position: unknown;
          position_uncertainty_m: number;
          province: string | null;
          sort_order: number;
          updated_at: string;
          verification_note: string | null;
          verified_area_m2: number | null;
          verified_at: string | null;
          verified_by: string | null;
          village: string | null;
          withdrawn_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          application_id: string;
          boundary?: unknown;
          created_at?: string;
          customer_user_id: string;
          declared_area_m2: number;
          district?: string | null;
          estimated_tree_count?: number | null;
          id?: string;
          irrigation?: Database["public"]["Enums"]["irrigation_type"];
          name: string;
          org_id: string;
          parcel_id?: string | null;
          position: unknown;
          position_uncertainty_m?: number;
          province?: string | null;
          sort_order?: number;
          updated_at?: string;
          verification_note?: string | null;
          verified_area_m2?: number | null;
          verified_at?: string | null;
          verified_by?: string | null;
          village?: string | null;
          withdrawn_at?: string | null;
        };
        Update: {
          application_id?: string;
          boundary?: unknown;
          created_at?: string;
          customer_user_id?: string;
          declared_area_m2?: number;
          district?: string | null;
          estimated_tree_count?: number | null;
          id?: string;
          irrigation?: Database["public"]["Enums"]["irrigation_type"];
          name?: string;
          org_id?: string;
          parcel_id?: string | null;
          position?: unknown;
          position_uncertainty_m?: number;
          province?: string | null;
          sort_order?: number;
          updated_at?: string;
          verification_note?: string | null;
          verified_area_m2?: number | null;
          verified_at?: string | null;
          verified_by?: string | null;
          village?: string | null;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "application_garden_application_id_customer_user_id_org_id_fkey";
            columns: ["application_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_application";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "application_garden_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "application_garden_parcel_id_fkey";
            columns: ["parcel_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          assessed_at: string;
          assessed_by: string | null;
          auto_approved: boolean;
          confidence: number | null;
          created_at: string;
          id: string;
          methodology_version: string | null;
          model_name: string | null;
          model_version: string | null;
          notes: string | null;
          org_id: string;
          overall_class: Database["public"]["Enums"]["health_class"] | null;
          parcel_id: string;
          session_id: string;
          source: Database["public"]["Enums"]["assessment_source"];
          tree_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          assessed_at?: string;
          assessed_by?: string | null;
          auto_approved?: boolean;
          confidence?: number | null;
          created_at?: string;
          id?: string;
          methodology_version?: string | null;
          model_name?: string | null;
          model_version?: string | null;
          notes?: string | null;
          org_id: string;
          overall_class?: Database["public"]["Enums"]["health_class"] | null;
          parcel_id: string;
          session_id: string;
          source: Database["public"]["Enums"]["assessment_source"];
          tree_id?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          assessed_at?: string;
          assessed_by?: string | null;
          auto_approved?: boolean;
          confidence?: number | null;
          created_at?: string;
          id?: string;
          methodology_version?: string | null;
          model_name?: string | null;
          model_version?: string | null;
          notes?: string | null;
          org_id?: string;
          overall_class?: Database["public"]["Enums"]["health_class"] | null;
          parcel_id?: string;
          session_id?: string;
          source?: Database["public"]["Enums"]["assessment_source"];
          tree_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "assessment_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "assessment_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      assessment_measurement: {
        Row: {
          assessment_id: string;
          measurement_id: string;
          org_id: string;
          parcel_id: string;
        };
        ComputedFields: never;
        Insert: {
          assessment_id: string;
          measurement_id: string;
          org_id: string;
          parcel_id: string;
        };
        Update: {
          assessment_id?: string;
          measurement_id?: string;
          org_id?: string;
          parcel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_measurement_assessment_id_parcel_id_org_id_fkey";
            columns: ["assessment_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "assessment";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "assessment_measurement_assessment_id_parcel_id_org_id_fkey";
            columns: ["assessment_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree_latest_assessment";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "assessment_measurement_measurement_id_parcel_id_org_id_fkey";
            columns: ["measurement_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "measurement";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "assessment_measurement_measurement_id_parcel_id_org_id_fkey";
            columns: ["measurement_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree_latest_measurement";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      asset: {
        Row: {
          byte_size: number | null;
          content_hash: string;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["asset_kind"];
          mime_type: string | null;
          org_id: string;
          params_hash: string | null;
          parcel_id: string;
          pipeline: string;
          pipeline_version: string;
          pose: Json | null;
          position: unknown;
          position_uncertainty_m: number | null;
          produced_at: string;
          quality_score: number | null;
          session_id: string;
          tree_id: string | null;
          uri: string;
        };
        ComputedFields: never;
        Insert: {
          byte_size?: number | null;
          content_hash: string;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["asset_kind"];
          mime_type?: string | null;
          org_id: string;
          params_hash?: string | null;
          parcel_id: string;
          pipeline: string;
          pipeline_version: string;
          pose?: Json | null;
          position?: unknown;
          position_uncertainty_m?: number | null;
          produced_at?: string;
          quality_score?: number | null;
          session_id: string;
          tree_id?: string | null;
          uri: string;
        };
        Update: {
          byte_size?: number | null;
          content_hash?: string;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["asset_kind"];
          mime_type?: string | null;
          org_id?: string;
          params_hash?: string | null;
          parcel_id?: string;
          pipeline?: string;
          pipeline_version?: string;
          pose?: Json | null;
          position?: unknown;
          position_uncertainty_m?: number | null;
          produced_at?: string;
          quality_score?: number | null;
          session_id?: string;
          tree_id?: string | null;
          uri?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asset_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "asset_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "asset_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      asset_source: {
        Row: {
          asset_id: string;
          created_at: string;
          id: string;
          org_id: string;
          parcel_id: string;
          source_asset_id: string | null;
          source_capture_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          asset_id: string;
          created_at?: string;
          id?: string;
          org_id: string;
          parcel_id: string;
          source_asset_id?: string | null;
          source_capture_id?: string | null;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          parcel_id?: string;
          source_asset_id?: string | null;
          source_capture_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "asset_source_asset_id_parcel_id_org_id_fkey";
            columns: ["asset_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "asset";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "asset_source_source_asset_id_parcel_id_org_id_fkey";
            columns: ["source_asset_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "asset";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "asset_source_source_capture_id_parcel_id_org_id_fkey";
            columns: ["source_capture_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "capture";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      audit_event: {
        Row: {
          action: string;
          actor_role: string;
          actor_user_id: string | null;
          created_at: string;
          details: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: string;
          org_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_role: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          org_id: string;
        };
        Update: {
          action?: string;
          actor_role?: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_event_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      boundary: {
        Row: {
          area_m2: number | null;
          created_at: string;
          created_by: string | null;
          geom: unknown;
          id: string;
          org_id: string;
          owner_approved_at: string | null;
          owner_approved_by: string | null;
          parcel_id: string;
          session_id: string | null;
          source: Database["public"]["Enums"]["boundary_source"];
          surveyed_at: string | null;
          version: number;
          vertex_uncertainty_m: number | null;
        };
        ComputedFields: never;
        Insert: {
          area_m2?: never;
          created_at?: string;
          created_by?: string | null;
          geom: unknown;
          id?: string;
          org_id: string;
          owner_approved_at?: string | null;
          owner_approved_by?: string | null;
          parcel_id: string;
          session_id?: string | null;
          source: Database["public"]["Enums"]["boundary_source"];
          surveyed_at?: string | null;
          version: number;
          vertex_uncertainty_m?: number | null;
        };
        Update: {
          area_m2?: never;
          created_at?: string;
          created_by?: string | null;
          geom?: unknown;
          id?: string;
          org_id?: string;
          owner_approved_at?: string | null;
          owner_approved_by?: string | null;
          parcel_id?: string;
          session_id?: string | null;
          source?: Database["public"]["Enums"]["boundary_source"];
          surveyed_at?: string | null;
          version?: number;
          vertex_uncertainty_m?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "boundary_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "boundary_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      calibration: {
        Row: {
          chip_id: number;
          created_at: string;
          extrinsics: Json | null;
          id: string;
          intrinsics: Json | null;
          org_id: string;
          rig_id: string;
          sensor_id: string | null;
          valid_from: string;
          valid_to: string | null;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          chip_id?: never;
          created_at?: string;
          extrinsics?: Json | null;
          id?: string;
          intrinsics?: Json | null;
          org_id: string;
          rig_id: string;
          sensor_id?: string | null;
          valid_from: string;
          valid_to?: string | null;
          version: string;
        };
        Update: {
          chip_id?: never;
          created_at?: string;
          extrinsics?: Json | null;
          id?: string;
          intrinsics?: Json | null;
          org_id?: string;
          rig_id?: string;
          sensor_id?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calibration_rig_id_org_id_fkey";
            columns: ["rig_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "rig";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "calibration_sensor_id_org_id_fkey";
            columns: ["sensor_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "sensor";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      capture: {
        Row: {
          byte_size: number | null;
          calibration_id: string | null;
          captured_by: string | null;
          content_hash: string;
          created_at: string;
          ended_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["capture_kind"];
          metadata: NonNullable<Json>;
          mime_type: string | null;
          org_id: string;
          parcel_id: string;
          position: unknown;
          position_uncertainty_m: number | null;
          rig_id: string | null;
          sensor_id: string | null;
          session_id: string;
          started_at: string;
          tree_id: string | null;
          uri: string;
        };
        ComputedFields: never;
        Insert: {
          byte_size?: number | null;
          calibration_id?: string | null;
          captured_by?: string | null;
          content_hash: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["capture_kind"];
          metadata?: NonNullable<Json>;
          mime_type?: string | null;
          org_id: string;
          parcel_id: string;
          position?: unknown;
          position_uncertainty_m?: number | null;
          rig_id?: string | null;
          sensor_id?: string | null;
          session_id: string;
          started_at: string;
          tree_id?: string | null;
          uri: string;
        };
        Update: {
          byte_size?: number | null;
          calibration_id?: string | null;
          captured_by?: string | null;
          content_hash?: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["capture_kind"];
          metadata?: NonNullable<Json>;
          mime_type?: string | null;
          org_id?: string;
          parcel_id?: string;
          position?: unknown;
          position_uncertainty_m?: number | null;
          rig_id?: string | null;
          sensor_id?: string | null;
          session_id?: string;
          started_at?: string;
          tree_id?: string | null;
          uri?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capture_calibration_id_org_id_fkey";
            columns: ["calibration_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "calibration";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "capture_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "capture_rig_id_org_id_fkey";
            columns: ["rig_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "rig";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "capture_sensor_id_org_id_fkey";
            columns: ["sensor_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "sensor";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "capture_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "capture_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      coverage_report: {
        Row: {
          active_trees: number;
          blind_spot_cells: NonNullable<Json>;
          blind_spots: number;
          covered_trees: number;
          created_at: string;
          created_by: string | null;
          id: string;
          missing_slot_codes: string[];
          missing_trees: number | null;
          org_id: string;
          params_hash: string;
          parcel_id: string;
          passed: boolean | null;
          pipeline: string;
          pipeline_version: string;
          ratio: number | null;
          rescan_needed: boolean | null;
          rule: NonNullable<Json>;
          session_id: string;
          threshold: number;
          waived_at: string | null;
          waived_by: string | null;
          waiver_note: string | null;
        };
        ComputedFields: never;
        Insert: {
          active_trees: number;
          blind_spot_cells?: NonNullable<Json>;
          blind_spots: number;
          covered_trees: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          missing_slot_codes?: string[];
          missing_trees?: never;
          org_id: string;
          params_hash: string;
          parcel_id: string;
          passed?: never;
          pipeline: string;
          pipeline_version: string;
          ratio?: never;
          rescan_needed?: never;
          rule?: NonNullable<Json>;
          session_id: string;
          threshold: number;
          waived_at?: string | null;
          waived_by?: string | null;
          waiver_note?: string | null;
        };
        Update: {
          active_trees?: number;
          blind_spot_cells?: NonNullable<Json>;
          blind_spots?: number;
          covered_trees?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          missing_slot_codes?: string[];
          missing_trees?: never;
          org_id?: string;
          params_hash?: string;
          parcel_id?: string;
          passed?: never;
          pipeline?: string;
          pipeline_version?: string;
          ratio?: never;
          rescan_needed?: never;
          rule?: NonNullable<Json>;
          session_id?: string;
          threshold?: number;
          waived_at?: string | null;
          waived_by?: string | null;
          waiver_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coverage_report_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "coverage_report_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      device: {
        Row: {
          created_at: string;
          firmware_version: string | null;
          id: string;
          kind: Database["public"]["Enums"]["device_kind"];
          manufacturer: string;
          model: string;
          name: string | null;
          org_id: string;
          serial_number: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          firmware_version?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["device_kind"];
          manufacturer: string;
          model: string;
          name?: string | null;
          org_id: string;
          serial_number?: string | null;
        };
        Update: {
          created_at?: string;
          firmware_version?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["device_kind"];
          manufacturer?: string;
          model?: string;
          name?: string | null;
          org_id?: string;
          serial_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "device_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      finding: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          assessment_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          kind: string;
          location: unknown;
          org_id: string;
          parcel_id: string;
          position_uncertainty_m: number | null;
          recommendation: string | null;
          session_id: string;
          severity: Database["public"]["Enums"]["finding_severity"];
          tree_id: string | null;
          zone_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          assessment_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description: string;
          id?: string;
          kind: string;
          location?: unknown;
          org_id: string;
          parcel_id: string;
          position_uncertainty_m?: number | null;
          recommendation?: string | null;
          session_id: string;
          severity: Database["public"]["Enums"]["finding_severity"];
          tree_id?: string | null;
          zone_id?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          assessment_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          kind?: string;
          location?: unknown;
          org_id?: string;
          parcel_id?: string;
          position_uncertainty_m?: number | null;
          recommendation?: string | null;
          session_id?: string;
          severity?: Database["public"]["Enums"]["finding_severity"];
          tree_id?: string | null;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "finding_assessment_id_parcel_id_org_id_fkey";
            columns: ["assessment_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "assessment";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "finding_assessment_id_parcel_id_org_id_fkey";
            columns: ["assessment_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree_latest_assessment";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "finding_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "finding_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "finding_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "finding_zone_id_parcel_id_org_id_fkey";
            columns: ["zone_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "zone";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      finding_evidence: {
        Row: {
          asset_id: string;
          created_at: string;
          finding_id: string;
          org_id: string;
          parcel_id: string;
        };
        ComputedFields: never;
        Insert: {
          asset_id: string;
          created_at?: string;
          finding_id: string;
          org_id: string;
          parcel_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          finding_id?: string;
          org_id?: string;
          parcel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finding_evidence_asset_id_parcel_id_org_id_fkey";
            columns: ["asset_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "asset";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "finding_evidence_finding_id_parcel_id_org_id_fkey";
            columns: ["finding_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "finding";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      followup_request: {
        Row: {
          coverage_report_id: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["followup_kind"];
          note: string | null;
          org_id: string;
          origin: Database["public"]["Enums"]["followup_origin"];
          parcel_id: string;
          requested_by: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          source_session_id: string;
          status: Database["public"]["Enums"]["followup_status"];
          target_session_id: string | null;
          tree_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          coverage_report_id?: string | null;
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["followup_kind"];
          note?: string | null;
          org_id: string;
          origin?: Database["public"]["Enums"]["followup_origin"];
          parcel_id: string;
          requested_by?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_session_id: string;
          status?: Database["public"]["Enums"]["followup_status"];
          target_session_id?: string | null;
          tree_id?: string | null;
        };
        Update: {
          coverage_report_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["followup_kind"];
          note?: string | null;
          org_id?: string;
          origin?: Database["public"]["Enums"]["followup_origin"];
          parcel_id?: string;
          requested_by?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_session_id?: string;
          status?: Database["public"]["Enums"]["followup_status"];
          target_session_id?: string | null;
          tree_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "followup_request_coverage_report_id_parcel_id_org_id_fkey";
            columns: ["coverage_report_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "coverage_report";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "followup_request_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "followup_request_source_session_id_parcel_id_org_id_fkey";
            columns: ["source_session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "followup_request_target_session_id_parcel_id_org_id_fkey";
            columns: ["target_session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "followup_request_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      garden_removal: {
        Row: {
          access_days: number;
          access_notice_sent_at: string | null;
          access_revoked_at: string | null;
          access_until: string | null;
          at_period_end: boolean;
          blocked_reason: string | null;
          calculation: Json | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          created_at: string;
          customer_note: string | null;
          customer_user_id: string;
          decided_by: string | null;
          effective_on: string | null;
          garden_name: string;
          id: string;
          initiated_by: string;
          notice_channel: string | null;
          notice_received_on: string | null;
          number: string;
          ops_note: string | null;
          order_id: string;
          order_item_id: string;
          org_id: string;
          parcel_id: string;
          reason: Database["public"]["Enums"]["garden_removal_reason"];
          refund_kurus: number | null;
          refund_mode: string | null;
          requested_at: string;
          requested_by: string | null;
          requested_effective_on: string;
          revoke_all_access: boolean;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["garden_removal_status"];
          updated_at: string;
          withdrawal: boolean;
        };
        ComputedFields: never;
        Insert: {
          access_days: number;
          access_notice_sent_at?: string | null;
          access_revoked_at?: string | null;
          access_until?: string | null;
          at_period_end?: boolean;
          blocked_reason?: string | null;
          calculation?: Json | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          customer_note?: string | null;
          customer_user_id: string;
          decided_by?: string | null;
          effective_on?: string | null;
          garden_name: string;
          id?: string;
          initiated_by: string;
          notice_channel?: string | null;
          notice_received_on?: string | null;
          number: string;
          ops_note?: string | null;
          order_id: string;
          order_item_id: string;
          org_id: string;
          parcel_id: string;
          reason: Database["public"]["Enums"]["garden_removal_reason"];
          refund_kurus?: number | null;
          refund_mode?: string | null;
          requested_at?: string;
          requested_by?: string | null;
          requested_effective_on: string;
          revoke_all_access?: boolean;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["garden_removal_status"];
          updated_at?: string;
          withdrawal?: boolean;
        };
        Update: {
          access_days?: number;
          access_notice_sent_at?: string | null;
          access_revoked_at?: string | null;
          access_until?: string | null;
          at_period_end?: boolean;
          blocked_reason?: string | null;
          calculation?: Json | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          customer_note?: string | null;
          customer_user_id?: string;
          decided_by?: string | null;
          effective_on?: string | null;
          garden_name?: string;
          id?: string;
          initiated_by?: string;
          notice_channel?: string | null;
          notice_received_on?: string | null;
          number?: string;
          ops_note?: string | null;
          order_id?: string;
          order_item_id?: string;
          org_id?: string;
          parcel_id?: string;
          reason?: Database["public"]["Enums"]["garden_removal_reason"];
          refund_kurus?: number | null;
          refund_mode?: string | null;
          requested_at?: string;
          requested_by?: string | null;
          requested_effective_on?: string;
          revoke_all_access?: boolean;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["garden_removal_status"];
          updated_at?: string;
          withdrawal?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "garden_removal_order_id_customer_user_id_org_id_fkey";
            columns: ["order_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "garden_removal_order_item_id_order_id_fkey";
            columns: ["order_item_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "service_order_item";
            referencedColumns: ["id", "order_id"];
          },
          {
            foreignKeyName: "garden_removal_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "garden_removal_parcel_id_fkey";
            columns: ["parcel_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id"];
          },
        ];
      };
      measurement: {
        Row: {
          confidence: number | null;
          created_at: string;
          id: string;
          measured_at: string;
          method: string;
          method_version: string;
          metric_definition_id: string;
          org_id: string;
          params_hash: string | null;
          parcel_id: string;
          recorded_by: string | null;
          session_id: string;
          slot_id: string | null;
          source: Database["public"]["Enums"]["measurement_source"];
          subject: Database["public"]["Enums"]["measurement_subject"] | null;
          tree_id: string | null;
          uncertainty: number | null;
          unit: string | null;
          value_boolean: boolean | null;
          value_category: string | null;
          value_numeric: number | null;
          value_scale: number | null;
          zone_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          confidence?: number | null;
          created_at?: string;
          id?: string;
          measured_at: string;
          method: string;
          method_version: string;
          metric_definition_id: string;
          org_id: string;
          params_hash?: string | null;
          parcel_id: string;
          recorded_by?: string | null;
          session_id: string;
          slot_id?: string | null;
          source: Database["public"]["Enums"]["measurement_source"];
          subject?: never;
          tree_id?: string | null;
          uncertainty?: number | null;
          unit?: string | null;
          value_boolean?: boolean | null;
          value_category?: string | null;
          value_numeric?: number | null;
          value_scale?: number | null;
          zone_id?: string | null;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          id?: string;
          measured_at?: string;
          method?: string;
          method_version?: string;
          metric_definition_id?: string;
          org_id?: string;
          params_hash?: string | null;
          parcel_id?: string;
          recorded_by?: string | null;
          session_id?: string;
          slot_id?: string | null;
          source?: Database["public"]["Enums"]["measurement_source"];
          subject?: never;
          tree_id?: string | null;
          uncertainty?: number | null;
          unit?: string | null;
          value_boolean?: boolean | null;
          value_category?: string | null;
          value_numeric?: number | null;
          value_scale?: number | null;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "measurement_metric_definition_id_fkey";
            columns: ["metric_definition_id"];
            isOneToOne: false;
            referencedRelation: "metric_definition";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "measurement_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "measurement_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_slot_id_parcel_id_org_id_fkey";
            columns: ["slot_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "slot";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_zone_id_parcel_id_org_id_fkey";
            columns: ["zone_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "zone";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      measurement_evidence: {
        Row: {
          asset_id: string;
          created_at: string;
          measurement_id: string;
          org_id: string;
          parcel_id: string;
        };
        ComputedFields: never;
        Insert: {
          asset_id: string;
          created_at?: string;
          measurement_id: string;
          org_id: string;
          parcel_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          measurement_id?: string;
          org_id?: string;
          parcel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "measurement_evidence_asset_id_parcel_id_org_id_fkey";
            columns: ["asset_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "asset";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_evidence_measurement_id_parcel_id_org_id_fkey";
            columns: ["measurement_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "measurement";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_evidence_measurement_id_parcel_id_org_id_fkey";
            columns: ["measurement_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree_latest_measurement";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      membership: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      metric_definition: {
        Row: {
          card_visibility: Database["public"]["Enums"]["card_visibility"];
          categories: string[] | null;
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          scale_max: number | null;
          scale_min: number | null;
          subject_kinds: Database["public"]["Enums"]["measurement_subject"][];
          unit: string | null;
          valid_seasons: Database["public"]["Enums"]["season"][];
          value_type: Database["public"]["Enums"]["metric_value_type"];
        };
        ComputedFields: never;
        Insert: {
          card_visibility: Database["public"]["Enums"]["card_visibility"];
          categories?: string[] | null;
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          scale_max?: number | null;
          scale_min?: number | null;
          subject_kinds?: Database["public"]["Enums"]["measurement_subject"][];
          unit?: string | null;
          valid_seasons: Database["public"]["Enums"]["season"][];
          value_type: Database["public"]["Enums"]["metric_value_type"];
        };
        Update: {
          card_visibility?: Database["public"]["Enums"]["card_visibility"];
          categories?: string[] | null;
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          scale_max?: number | null;
          scale_min?: number | null;
          subject_kinds?: Database["public"]["Enums"]["measurement_subject"][];
          unit?: string | null;
          valid_seasons?: Database["public"]["Enums"]["season"][];
          value_type?: Database["public"]["Enums"]["metric_value_type"];
        };
        Relationships: [];
      };
      notification: {
        Row: {
          attempts: number;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          finding_id: string | null;
          id: string;
          last_error: string | null;
          locked_until: string | null;
          next_attempt_at: string;
          org_id: string;
          parcel_id: string | null;
          provider_message_id: string | null;
          recipient_user_id: string;
          ref_id: string | null;
          sent_at: string | null;
          sent_via: string | null;
          session_id: string | null;
          status: Database["public"]["Enums"]["notification_status"];
          template: Database["public"]["Enums"]["notification_template"];
          vars: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          finding_id?: string | null;
          id?: string;
          last_error?: string | null;
          locked_until?: string | null;
          next_attempt_at?: string;
          org_id: string;
          parcel_id?: string | null;
          provider_message_id?: string | null;
          recipient_user_id: string;
          ref_id?: string | null;
          sent_at?: string | null;
          sent_via?: string | null;
          session_id?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          template: Database["public"]["Enums"]["notification_template"];
          vars?: NonNullable<Json>;
        };
        Update: {
          attempts?: number;
          channel?: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          finding_id?: string | null;
          id?: string;
          last_error?: string | null;
          locked_until?: string | null;
          next_attempt_at?: string;
          org_id?: string;
          parcel_id?: string | null;
          provider_message_id?: string | null;
          recipient_user_id?: string;
          ref_id?: string | null;
          sent_at?: string | null;
          sent_via?: string | null;
          session_id?: string | null;
          status?: Database["public"]["Enums"]["notification_status"];
          template?: Database["public"]["Enums"]["notification_template"];
          vars?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "notification_finding_id_parcel_id_org_id_fkey";
            columns: ["finding_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "finding";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "notification_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "notification_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      operation: {
        Row: {
          area: unknown;
          area_m2: number | null;
          created_at: string;
          created_by: string | null;
          details: NonNullable<Json>;
          dose: number | null;
          dose_unit: string | null;
          ended_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["operation_kind"];
          notes: string | null;
          org_id: string;
          parcel_id: string;
          performed_by: string | null;
          performer: Database["public"]["Enums"]["performer_kind"];
          prescription_no: string | null;
          product_name: string | null;
          session_id: string | null;
          started_at: string;
        };
        ComputedFields: never;
        Insert: {
          area?: unknown;
          area_m2?: number | null;
          created_at?: string;
          created_by?: string | null;
          details?: NonNullable<Json>;
          dose?: number | null;
          dose_unit?: string | null;
          ended_at?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["operation_kind"];
          notes?: string | null;
          org_id: string;
          parcel_id: string;
          performed_by?: string | null;
          performer?: Database["public"]["Enums"]["performer_kind"];
          prescription_no?: string | null;
          product_name?: string | null;
          session_id?: string | null;
          started_at: string;
        };
        Update: {
          area?: unknown;
          area_m2?: number | null;
          created_at?: string;
          created_by?: string | null;
          details?: NonNullable<Json>;
          dose?: number | null;
          dose_unit?: string | null;
          ended_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["operation_kind"];
          notes?: string | null;
          org_id?: string;
          parcel_id?: string;
          performed_by?: string | null;
          performer?: Database["public"]["Enums"]["performer_kind"];
          prescription_no?: string | null;
          product_name?: string | null;
          session_id?: string | null;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operation_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "operation_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      org: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["org_kind"];
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["org_kind"];
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["org_kind"];
          name?: string;
        };
        Relationships: [];
      };
      org_billing_setting: {
        Row: {
          accepts_signups: boolean;
          addon_min_days: number;
          address: string | null;
          allow_fake_payments: boolean;
          bank_name: string | null;
          boundary_declaration_required: boolean;
          coowner_notice_flow_enabled: boolean;
          created_at: string;
          email: string | null;
          garden_changes_enabled: boolean;
          iban: string | null;
          iban_holder: string | null;
          identity_number_required: boolean;
          inventory_reuse_months: number;
          kep_address: string | null;
          kvkk_email: string | null;
          kvkk_request_form_enabled: boolean;
          legal_gate_enforced: boolean;
          legal_name: string | null;
          marketing_consent_enabled: boolean;
          mersis_number: string | null;
          org_id: string;
          payment_due_days: number;
          phone: string | null;
          quote_valid_days: number;
          removal_access_days: number;
          removal_notice_days: number;
          removal_refund_mode: string;
          renewal_notice_days: number;
          site_domain: string | null;
          tax_number: string | null;
          tax_office: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepts_signups?: boolean;
          addon_min_days?: number;
          address?: string | null;
          allow_fake_payments?: boolean;
          bank_name?: string | null;
          boundary_declaration_required?: boolean;
          coowner_notice_flow_enabled?: boolean;
          created_at?: string;
          email?: string | null;
          garden_changes_enabled?: boolean;
          iban?: string | null;
          iban_holder?: string | null;
          identity_number_required?: boolean;
          inventory_reuse_months?: number;
          kep_address?: string | null;
          kvkk_email?: string | null;
          kvkk_request_form_enabled?: boolean;
          legal_gate_enforced?: boolean;
          legal_name?: string | null;
          marketing_consent_enabled?: boolean;
          mersis_number?: string | null;
          org_id: string;
          payment_due_days?: number;
          phone?: string | null;
          quote_valid_days?: number;
          removal_access_days?: number;
          removal_notice_days?: number;
          removal_refund_mode?: string;
          renewal_notice_days?: number;
          site_domain?: string | null;
          tax_number?: string | null;
          tax_office?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          accepts_signups?: boolean;
          addon_min_days?: number;
          address?: string | null;
          allow_fake_payments?: boolean;
          bank_name?: string | null;
          boundary_declaration_required?: boolean;
          coowner_notice_flow_enabled?: boolean;
          created_at?: string;
          email?: string | null;
          garden_changes_enabled?: boolean;
          iban?: string | null;
          iban_holder?: string | null;
          identity_number_required?: boolean;
          inventory_reuse_months?: number;
          kep_address?: string | null;
          kvkk_email?: string | null;
          kvkk_request_form_enabled?: boolean;
          legal_gate_enforced?: boolean;
          legal_name?: string | null;
          marketing_consent_enabled?: boolean;
          mersis_number?: string | null;
          org_id?: string;
          payment_due_days?: number;
          phone?: string | null;
          quote_valid_days?: number;
          removal_access_days?: number;
          removal_notice_days?: number;
          removal_refund_mode?: string;
          renewal_notice_days?: number;
          site_domain?: string | null;
          tax_number?: string | null;
          tax_office?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "org_billing_setting_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      parcel: {
        Row: {
          created_at: string;
          district: string | null;
          estimated_area_m2: number | null;
          estimated_tree_count: number | null;
          id: string;
          irrigation: Database["public"]["Enums"]["irrigation_type"];
          local_origin: unknown;
          local_origin_uncertainty_m: number | null;
          name: string;
          numbering_origin_corner: Database["public"]["Enums"]["corner"] | null;
          org_id: string;
          position: unknown;
          position_uncertainty_m: number | null;
          province: string | null;
          row_azimuth_deg: number | null;
          status: Database["public"]["Enums"]["parcel_status"];
          village: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          district?: string | null;
          estimated_area_m2?: number | null;
          estimated_tree_count?: number | null;
          id?: string;
          irrigation?: Database["public"]["Enums"]["irrigation_type"];
          local_origin?: unknown;
          local_origin_uncertainty_m?: number | null;
          name: string;
          numbering_origin_corner?: Database["public"]["Enums"]["corner"] | null;
          org_id: string;
          position?: unknown;
          position_uncertainty_m?: number | null;
          province?: string | null;
          row_azimuth_deg?: number | null;
          status?: Database["public"]["Enums"]["parcel_status"];
          village?: string | null;
        };
        Update: {
          created_at?: string;
          district?: string | null;
          estimated_area_m2?: number | null;
          estimated_tree_count?: number | null;
          id?: string;
          irrigation?: Database["public"]["Enums"]["irrigation_type"];
          local_origin?: unknown;
          local_origin_uncertainty_m?: number | null;
          name?: string;
          numbering_origin_corner?: Database["public"]["Enums"]["corner"] | null;
          org_id?: string;
          position?: unknown;
          position_uncertainty_m?: number | null;
          province?: string | null;
          row_azimuth_deg?: number | null;
          status?: Database["public"]["Enums"]["parcel_status"];
          village?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "parcel_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      parcel_access: {
        Row: {
          created_at: string;
          granted_by: string | null;
          id: string;
          org_id: string;
          parcel_id: string;
          role: Database["public"]["Enums"]["parcel_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          org_id: string;
          parcel_id: string;
          role: Database["public"]["Enums"]["parcel_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          org_id?: string;
          parcel_id?: string;
          role?: Database["public"]["Enums"]["parcel_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parcel_access_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      parcel_route: {
        Row: {
          basis: string;
          content_hash: string;
          created_at: string;
          created_by: string | null;
          generator: string;
          id: string;
          org_id: string;
          parcel_id: string;
          route: NonNullable<Json>;
          session_id: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          basis: string;
          content_hash: string;
          created_at?: string;
          created_by?: string | null;
          generator: string;
          id: string;
          org_id: string;
          parcel_id: string;
          route: NonNullable<Json>;
          session_id?: string | null;
          version: number;
        };
        Update: {
          basis?: string;
          content_hash?: string;
          created_at?: string;
          created_by?: string | null;
          generator?: string;
          id?: string;
          org_id?: string;
          parcel_id?: string;
          route?: NonNullable<Json>;
          session_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "parcel_route_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "parcel_route_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      payment: {
        Row: {
          amount_kurus: number;
          bank_reference: string | null;
          card_association: string | null;
          card_family: string | null;
          card_last4: string | null;
          created_at: string;
          currency: string;
          customer_user_id: string;
          failed_at: string | null;
          failure_code: string | null;
          fraud_status: number | null;
          id: string;
          initiated_at: string;
          installment: number;
          manual_note: string | null;
          order_id: string;
          org_id: string;
          paid_kurus: number | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_amount_kurus: number | null;
          provider_payment_id: string | null;
          provider_token: string | null;
          receipt_number: string | null;
          recorded_by: string | null;
          refunded_kurus: number;
          return_origin: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          succeeded_at: string | null;
          token_expires_at: string | null;
          updated_at: string;
          value_date: string | null;
          voided_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_kurus: number;
          bank_reference?: string | null;
          card_association?: string | null;
          card_family?: string | null;
          card_last4?: string | null;
          created_at?: string;
          currency?: string;
          customer_user_id: string;
          failed_at?: string | null;
          failure_code?: string | null;
          fraud_status?: number | null;
          id?: string;
          initiated_at?: string;
          installment?: number;
          manual_note?: string | null;
          order_id: string;
          org_id: string;
          paid_kurus?: number | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          provider_amount_kurus?: number | null;
          provider_payment_id?: string | null;
          provider_token?: string | null;
          receipt_number?: string | null;
          recorded_by?: string | null;
          refunded_kurus?: number;
          return_origin?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          succeeded_at?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          value_date?: string | null;
          voided_at?: string | null;
        };
        Update: {
          amount_kurus?: number;
          bank_reference?: string | null;
          card_association?: string | null;
          card_family?: string | null;
          card_last4?: string | null;
          created_at?: string;
          currency?: string;
          customer_user_id?: string;
          failed_at?: string | null;
          failure_code?: string | null;
          fraud_status?: number | null;
          id?: string;
          initiated_at?: string;
          installment?: number;
          manual_note?: string | null;
          order_id?: string;
          org_id?: string;
          paid_kurus?: number | null;
          provider?: Database["public"]["Enums"]["payment_provider"];
          provider_amount_kurus?: number | null;
          provider_payment_id?: string | null;
          provider_token?: string | null;
          receipt_number?: string | null;
          recorded_by?: string | null;
          refunded_kurus?: number;
          return_origin?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          succeeded_at?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          value_date?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_order_id_customer_user_id_org_id_fkey";
            columns: ["order_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "payment_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_item: {
        Row: {
          amount_kurus: number;
          created_at: string;
          customer_user_id: string;
          id: string;
          line_no: number;
          name: string;
          order_item_id: string | null;
          org_id: string;
          payment_id: string;
          provider_item_id: string | null;
          refunded_kurus: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_kurus: number;
          created_at?: string;
          customer_user_id: string;
          id?: string;
          line_no: number;
          name: string;
          order_item_id?: string | null;
          org_id: string;
          payment_id: string;
          provider_item_id?: string | null;
          refunded_kurus?: number;
          updated_at?: string;
        };
        Update: {
          amount_kurus?: number;
          created_at?: string;
          customer_user_id?: string;
          id?: string;
          line_no?: number;
          name?: string;
          order_item_id?: string | null;
          org_id?: string;
          payment_id?: string;
          provider_item_id?: string | null;
          refunded_kurus?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_item_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "service_order_item";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_item_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_item_payment_id_customer_user_id_org_id_fkey";
            columns: ["payment_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "payment";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
        ];
      };
      price_list: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          note: string | null;
          org_id: string;
          published_at: string | null;
          published_by: string | null;
          status: Database["public"]["Enums"]["price_list_status"];
          updated_at: string;
          valid_from: string | null;
          vat_rate_bp: number;
          version: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          note?: string | null;
          org_id: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: Database["public"]["Enums"]["price_list_status"];
          updated_at?: string;
          valid_from?: string | null;
          vat_rate_bp?: number;
          version?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          note?: string | null;
          org_id?: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: Database["public"]["Enums"]["price_list_status"];
          updated_at?: string;
          valid_from?: string | null;
          vat_rate_bp?: number;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "price_list_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      price_list_item: {
        Row: {
          created_at: string;
          id: string;
          inventory_fee_kurus: number;
          minimum_fee_kurus: number;
          org_id: string;
          package_id: string;
          price_list_id: string;
          unit_price_kurus: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          inventory_fee_kurus?: number;
          minimum_fee_kurus?: number;
          org_id: string;
          package_id: string;
          price_list_id: string;
          unit_price_kurus: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          inventory_fee_kurus?: number;
          minimum_fee_kurus?: number;
          org_id?: string;
          package_id?: string;
          price_list_id?: string;
          unit_price_kurus?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_list_item_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_list_item_package_id_org_id_fkey";
            columns: ["package_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_package";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "price_list_item_price_list_id_org_id_fkey";
            columns: ["price_list_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "price_list";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      question: {
        Row: {
          author_role: Database["public"]["Enums"]["question_author_role"];
          body: string;
          created_at: string;
          created_by: string | null;
          edited_at: string | null;
          finding_id: string | null;
          id: string;
          org_id: string;
          parcel_id: string;
          tree_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          author_role: Database["public"]["Enums"]["question_author_role"];
          body: string;
          created_at?: string;
          created_by?: string | null;
          edited_at?: string | null;
          finding_id?: string | null;
          id?: string;
          org_id: string;
          parcel_id: string;
          tree_id?: string | null;
        };
        Update: {
          author_role?: Database["public"]["Enums"]["question_author_role"];
          body?: string;
          created_at?: string;
          created_by?: string | null;
          edited_at?: string | null;
          finding_id?: string | null;
          id?: string;
          org_id?: string;
          parcel_id?: string;
          tree_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "question_finding_id_parcel_id_org_id_fkey";
            columns: ["finding_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "finding";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "question_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "question_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      question_reply: {
        Row: {
          author_role: Database["public"]["Enums"]["question_author_role"];
          body: string;
          created_at: string;
          created_by: string | null;
          edited_at: string | null;
          id: string;
          org_id: string;
          parcel_id: string;
          question_id: string;
        };
        ComputedFields: never;
        Insert: {
          author_role: Database["public"]["Enums"]["question_author_role"];
          body: string;
          created_at?: string;
          created_by?: string | null;
          edited_at?: string | null;
          id?: string;
          org_id: string;
          parcel_id: string;
          question_id: string;
        };
        Update: {
          author_role?: Database["public"]["Enums"]["question_author_role"];
          body?: string;
          created_at?: string;
          created_by?: string | null;
          edited_at?: string | null;
          id?: string;
          org_id?: string;
          parcel_id?: string;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_reply_question_id_parcel_id_org_id_fkey";
            columns: ["question_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "question";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      quote: {
        Row: {
          addon_of_order_id: string | null;
          application_id: string | null;
          base_kurus: number;
          created_at: string;
          currency: string;
          customer_user_id: string;
          decided_at: string | null;
          decided_by: string | null;
          discount_bp: number;
          discount_kurus: number;
          discount_note: string | null;
          first_year: boolean;
          id: string;
          includes_inventory: boolean;
          inputs: NonNullable<Json>;
          issued_at: string;
          issued_by: string | null;
          note_to_customer: string | null;
          number: string;
          org_id: string;
          package_code: string;
          package_id: string;
          package_name: string;
          periodic_visits_per_year: number;
          price_list_id: string;
          price_list_version: number;
          proposed_service_start: string | null;
          renewal_of_order_id: string | null;
          status: Database["public"]["Enums"]["quote_status"];
          subtotal_kurus: number;
          total_kurus: number;
          updated_at: string;
          valid_until: string;
          vat_kurus: number;
          vat_rate_bp: number;
        };
        ComputedFields: never;
        Insert: {
          addon_of_order_id?: string | null;
          application_id?: string | null;
          base_kurus: number;
          created_at?: string;
          currency?: string;
          customer_user_id: string;
          decided_at?: string | null;
          decided_by?: string | null;
          discount_bp?: number;
          discount_kurus: number;
          discount_note?: string | null;
          first_year: boolean;
          id?: string;
          includes_inventory: boolean;
          inputs: NonNullable<Json>;
          issued_at?: string;
          issued_by?: string | null;
          note_to_customer?: string | null;
          number: string;
          org_id: string;
          package_code: string;
          package_id: string;
          package_name: string;
          periodic_visits_per_year: number;
          price_list_id: string;
          price_list_version: number;
          proposed_service_start?: string | null;
          renewal_of_order_id?: string | null;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal_kurus: number;
          total_kurus: number;
          updated_at?: string;
          valid_until: string;
          vat_kurus: number;
          vat_rate_bp: number;
        };
        Update: {
          addon_of_order_id?: string | null;
          application_id?: string | null;
          base_kurus?: number;
          created_at?: string;
          currency?: string;
          customer_user_id?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          discount_bp?: number;
          discount_kurus?: number;
          discount_note?: string | null;
          first_year?: boolean;
          id?: string;
          includes_inventory?: boolean;
          inputs?: NonNullable<Json>;
          issued_at?: string;
          issued_by?: string | null;
          note_to_customer?: string | null;
          number?: string;
          org_id?: string;
          package_code?: string;
          package_id?: string;
          package_name?: string;
          periodic_visits_per_year?: number;
          price_list_id?: string;
          price_list_version?: number;
          proposed_service_start?: string | null;
          renewal_of_order_id?: string | null;
          status?: Database["public"]["Enums"]["quote_status"];
          subtotal_kurus?: number;
          total_kurus?: number;
          updated_at?: string;
          valid_until?: string;
          vat_kurus?: number;
          vat_rate_bp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quote_addon_of_order_id_fkey";
            columns: ["addon_of_order_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_application_id_customer_user_id_org_id_fkey";
            columns: ["application_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_application";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "quote_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_package_id_org_id_fkey";
            columns: ["package_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_package";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "quote_price_list_id_org_id_fkey";
            columns: ["price_list_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "price_list";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "quote_renewal_of_order_id_fkey";
            columns: ["renewal_of_order_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id"];
          },
        ];
      };
      quote_item: {
        Row: {
          application_garden_id: string | null;
          area_m2: number;
          billable_area_tenths: number;
          created_at: string;
          customer_user_id: string;
          garden_name: string;
          id: string;
          inventory_fee_kurus: number;
          line_base_kurus: number;
          line_discount_kurus: number;
          line_no: number;
          line_subtotal_kurus: number;
          line_total_kurus: number;
          line_vat_kurus: number;
          minimum_fee_kurus: number;
          org_id: string;
          parcel_id: string | null;
          quote_id: string;
          unit_price_kurus: number;
          visit_amount_kurus: number;
          visits: number;
        };
        ComputedFields: never;
        Insert: {
          application_garden_id?: string | null;
          area_m2: number;
          billable_area_tenths: number;
          created_at?: string;
          customer_user_id: string;
          garden_name: string;
          id?: string;
          inventory_fee_kurus: number;
          line_base_kurus: number;
          line_discount_kurus: number;
          line_no: number;
          line_subtotal_kurus: number;
          line_total_kurus: number;
          line_vat_kurus: number;
          minimum_fee_kurus: number;
          org_id: string;
          parcel_id?: string | null;
          quote_id: string;
          unit_price_kurus: number;
          visit_amount_kurus: number;
          visits: number;
        };
        Update: {
          application_garden_id?: string | null;
          area_m2?: number;
          billable_area_tenths?: number;
          created_at?: string;
          customer_user_id?: string;
          garden_name?: string;
          id?: string;
          inventory_fee_kurus?: number;
          line_base_kurus?: number;
          line_discount_kurus?: number;
          line_no?: number;
          line_subtotal_kurus?: number;
          line_total_kurus?: number;
          line_vat_kurus?: number;
          minimum_fee_kurus?: number;
          org_id?: string;
          parcel_id?: string | null;
          quote_id?: string;
          unit_price_kurus?: number;
          visit_amount_kurus?: number;
          visits?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quote_item_application_garden_id_fkey";
            columns: ["application_garden_id"];
            isOneToOne: false;
            referencedRelation: "application_garden";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_item_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_item_parcel_id_fkey";
            columns: ["parcel_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_item_quote_id_customer_user_id_org_id_fkey";
            columns: ["quote_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "quote";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
        ];
      };
      refund: {
        Row: {
          amount_kurus: number;
          attempts: number;
          bank_reference: string | null;
          completed_on: string | null;
          created_at: string;
          currency: string;
          customer_user_id: string;
          failure_code: string | null;
          garden_removal_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["refund_kind"];
          note: string | null;
          number: string;
          order_id: string;
          org_id: string;
          payment_id: string;
          payment_item_id: string | null;
          processed_at: string | null;
          processing_since: string | null;
          provider_ref: string | null;
          reason: Database["public"]["Enums"]["refund_reason"];
          requested_at: string;
          requested_by: string | null;
          retryable: boolean | null;
          status: Database["public"]["Enums"]["refund_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_kurus: number;
          attempts?: number;
          bank_reference?: string | null;
          completed_on?: string | null;
          created_at?: string;
          currency?: string;
          customer_user_id: string;
          failure_code?: string | null;
          garden_removal_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["refund_kind"];
          note?: string | null;
          number: string;
          order_id: string;
          org_id: string;
          payment_id: string;
          payment_item_id?: string | null;
          processed_at?: string | null;
          processing_since?: string | null;
          provider_ref?: string | null;
          reason: Database["public"]["Enums"]["refund_reason"];
          requested_at?: string;
          requested_by?: string | null;
          retryable?: boolean | null;
          status?: Database["public"]["Enums"]["refund_status"];
          updated_at?: string;
        };
        Update: {
          amount_kurus?: number;
          attempts?: number;
          bank_reference?: string | null;
          completed_on?: string | null;
          created_at?: string;
          currency?: string;
          customer_user_id?: string;
          failure_code?: string | null;
          garden_removal_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["refund_kind"];
          note?: string | null;
          number?: string;
          order_id?: string;
          org_id?: string;
          payment_id?: string;
          payment_item_id?: string | null;
          processed_at?: string | null;
          processing_since?: string | null;
          provider_ref?: string | null;
          reason?: Database["public"]["Enums"]["refund_reason"];
          requested_at?: string;
          requested_by?: string | null;
          retryable?: boolean | null;
          status?: Database["public"]["Enums"]["refund_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refund_garden_removal_fk";
            columns: ["garden_removal_id"];
            isOneToOne: false;
            referencedRelation: "garden_removal";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_order_id_customer_user_id_org_id_fkey";
            columns: ["order_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "refund_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refund_payment_id_customer_user_id_org_id_fkey";
            columns: ["payment_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "payment";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "refund_payment_id_order_id_fkey";
            columns: ["payment_id", "order_id"];
            isOneToOne: false;
            referencedRelation: "payment";
            referencedColumns: ["id", "order_id"];
          },
          {
            foreignKeyName: "refund_payment_item_id_payment_id_fkey";
            columns: ["payment_item_id", "payment_id"];
            isOneToOne: false;
            referencedRelation: "payment_item";
            referencedColumns: ["id", "payment_id"];
          },
        ];
      };
      rig: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          org_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          org_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rig_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      rig_sensor: {
        Row: {
          created_at: string;
          mount: NonNullable<Json>;
          org_id: string;
          rig_id: string;
          sensor_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          mount?: NonNullable<Json>;
          org_id: string;
          rig_id: string;
          sensor_id: string;
        };
        Update: {
          created_at?: string;
          mount?: NonNullable<Json>;
          org_id?: string;
          rig_id?: string;
          sensor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rig_sensor_rig_id_org_id_fkey";
            columns: ["rig_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "rig";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "rig_sensor_sensor_id_org_id_fkey";
            columns: ["sensor_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "sensor";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      sensor: {
        Row: {
          created_at: string;
          device_id: string;
          firmware_version: string | null;
          id: string;
          kind: Database["public"]["Enums"]["sensor_kind"];
          manufacturer: string | null;
          model: string | null;
          org_id: string;
          serial_number: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          device_id: string;
          firmware_version?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["sensor_kind"];
          manufacturer?: string | null;
          model?: string | null;
          org_id: string;
          serial_number?: string | null;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          firmware_version?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["sensor_kind"];
          manufacturer?: string | null;
          model?: string | null;
          org_id?: string;
          serial_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sensor_device_id_org_id_fkey";
            columns: ["device_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "device";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      service_application: {
        Row: {
          created_at: string;
          customer_note: string | null;
          customer_user_id: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          number: string | null;
          ops_note: string | null;
          org_id: string;
          package_id: string | null;
          rejection_reason: Database["public"]["Enums"]["application_rejection_reason"] | null;
          status: Database["public"]["Enums"]["application_status"];
          submitted_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          customer_note?: string | null;
          customer_user_id: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          number?: string | null;
          ops_note?: string | null;
          org_id: string;
          package_id?: string | null;
          rejection_reason?: Database["public"]["Enums"]["application_rejection_reason"] | null;
          status?: Database["public"]["Enums"]["application_status"];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_note?: string | null;
          customer_user_id?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          number?: string | null;
          ops_note?: string | null;
          org_id?: string;
          package_id?: string | null;
          rejection_reason?: Database["public"]["Enums"]["application_rejection_reason"] | null;
          status?: Database["public"]["Enums"]["application_status"];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_application_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_application_package_id_org_id_fkey";
            columns: ["package_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_package";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      service_order: {
        Row: {
          activated_at: string | null;
          addon_of_order_id: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          created_at: string;
          currency: string;
          customer_user_id: string;
          id: string;
          number: string;
          org_id: string;
          paid_kurus: number;
          payment_due_at: string | null;
          quote_id: string;
          refunded_kurus: number;
          reminder_sent_at: string | null;
          renewal_of_order_id: string | null;
          service_end: string | null;
          service_start: string | null;
          status: Database["public"]["Enums"]["order_status"];
          terminated_at: string | null;
          termination_note: string | null;
          total_kurus: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          activated_at?: string | null;
          addon_of_order_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_user_id: string;
          id?: string;
          number: string;
          org_id: string;
          paid_kurus?: number;
          payment_due_at?: string | null;
          quote_id: string;
          refunded_kurus?: number;
          reminder_sent_at?: string | null;
          renewal_of_order_id?: string | null;
          service_end?: string | null;
          service_start?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          terminated_at?: string | null;
          termination_note?: string | null;
          total_kurus: number;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          addon_of_order_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_user_id?: string;
          id?: string;
          number?: string;
          org_id?: string;
          paid_kurus?: number;
          payment_due_at?: string | null;
          quote_id?: string;
          refunded_kurus?: number;
          reminder_sent_at?: string | null;
          renewal_of_order_id?: string | null;
          service_end?: string | null;
          service_start?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          terminated_at?: string | null;
          termination_note?: string | null;
          total_kurus?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_addon_of_order_id_fkey";
            columns: ["addon_of_order_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_order_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_order_quote_id_customer_user_id_org_id_fkey";
            columns: ["quote_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "quote";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "service_order_renewal_of_order_id_fkey";
            columns: ["renewal_of_order_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id"];
          },
        ];
      };
      service_order_item: {
        Row: {
          amount_kurus: number;
          created_at: string;
          customer_user_id: string;
          garden_name: string;
          garden_removal_id: string | null;
          id: string;
          line_no: number;
          order_id: string;
          org_id: string;
          parcel_id: string | null;
          quote_item_id: string;
          removed_on: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_kurus: number;
          created_at?: string;
          customer_user_id: string;
          garden_name: string;
          garden_removal_id?: string | null;
          id?: string;
          line_no: number;
          order_id: string;
          org_id: string;
          parcel_id?: string | null;
          quote_item_id: string;
          removed_on?: string | null;
          updated_at?: string;
        };
        Update: {
          amount_kurus?: number;
          created_at?: string;
          customer_user_id?: string;
          garden_name?: string;
          garden_removal_id?: string | null;
          id?: string;
          line_no?: number;
          order_id?: string;
          org_id?: string;
          parcel_id?: string | null;
          quote_item_id?: string;
          removed_on?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_item_garden_removal_fk";
            columns: ["garden_removal_id"];
            isOneToOne: false;
            referencedRelation: "garden_removal";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_order_item_order_id_customer_user_id_org_id_fkey";
            columns: ["order_id", "customer_user_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "service_order";
            referencedColumns: ["id", "customer_user_id", "org_id"];
          },
          {
            foreignKeyName: "service_order_item_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_order_item_parcel_id_fkey";
            columns: ["parcel_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_order_item_quote_item_id_fkey";
            columns: ["quote_item_id"];
            isOneToOne: true;
            referencedRelation: "quote_item";
            referencedColumns: ["id"];
          },
        ];
      };
      service_package: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          includes_inventory: boolean;
          name: string;
          org_id: string;
          periodic_visits_per_year: number;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          includes_inventory?: boolean;
          name: string;
          org_id: string;
          periodic_visits_per_year: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          includes_inventory?: boolean;
          name?: string;
          org_id?: string;
          periodic_visits_per_year?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_package_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "org";
            referencedColumns: ["id"];
          },
        ];
      };
      session: {
        Row: {
          camera_height_m: number | null;
          created_at: string;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["session_kind"];
          lead_user_id: string | null;
          methodology_version: string | null;
          notes: string | null;
          org_id: string;
          parcel_id: string;
          performer: Database["public"]["Enums"]["performer_kind"];
          planned_date: string | null;
          published_at: string | null;
          published_by: string | null;
          rig_id: string | null;
          scan_platform: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["session_status"];
          weather: Json | null;
        };
        ComputedFields: never;
        Insert: {
          camera_height_m?: number | null;
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["session_kind"];
          lead_user_id?: string | null;
          methodology_version?: string | null;
          notes?: string | null;
          org_id: string;
          parcel_id: string;
          performer?: Database["public"]["Enums"]["performer_kind"];
          planned_date?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          rig_id?: string | null;
          scan_platform?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["session_status"];
          weather?: Json | null;
        };
        Update: {
          camera_height_m?: number | null;
          created_at?: string;
          created_by?: string | null;
          ended_at?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["session_kind"];
          lead_user_id?: string | null;
          methodology_version?: string | null;
          notes?: string | null;
          org_id?: string;
          parcel_id?: string;
          performer?: Database["public"]["Enums"]["performer_kind"];
          planned_date?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          rig_id?: string | null;
          scan_platform?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["session_status"];
          weather?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "session_rig_id_org_id_fkey";
            columns: ["rig_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "rig";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      session_event: {
        Row: {
          created_at: string;
          data: Json | null;
          event_type: string;
          gps_time_ns: number;
          id: string;
          logger_result: string | null;
          org_id: string;
          parcel_id: string;
          payload: string;
          phone_time: string;
          recorded_by: string | null;
          session_id: string;
          time_source: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          data?: Json | null;
          event_type: string;
          gps_time_ns: number;
          id?: string;
          logger_result?: string | null;
          org_id: string;
          parcel_id: string;
          payload?: string;
          phone_time: string;
          recorded_by?: string | null;
          session_id: string;
          time_source: string;
        };
        Update: {
          created_at?: string;
          data?: Json | null;
          event_type?: string;
          gps_time_ns?: number;
          id?: string;
          logger_result?: string | null;
          org_id?: string;
          parcel_id?: string;
          payload?: string;
          phone_time?: string;
          recorded_by?: string | null;
          session_id?: string;
          time_source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_event_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "session_event_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      slot: {
        Row: {
          code: string | null;
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["slot_kind"];
          local_x_m: number | null;
          local_y_m: number | null;
          org_id: string;
          parcel_id: string;
          position: unknown;
          position_no: number;
          position_uncertainty_m: number | null;
          row_no: number;
          suffix: string | null;
        };
        ComputedFields: never;
        Insert: {
          code?: never;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["slot_kind"];
          local_x_m?: number | null;
          local_y_m?: number | null;
          org_id: string;
          parcel_id: string;
          position?: unknown;
          position_no: number;
          position_uncertainty_m?: number | null;
          row_no: number;
          suffix?: string | null;
        };
        Update: {
          code?: never;
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["slot_kind"];
          local_x_m?: number | null;
          local_y_m?: number | null;
          org_id?: string;
          parcel_id?: string;
          position?: unknown;
          position_no?: number;
          position_uncertainty_m?: number | null;
          row_no?: number;
          suffix?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "slot_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      tree: {
        Row: {
          age_class: Database["public"]["Enums"]["age_class"];
          created_at: string;
          cultivar: string | null;
          first_seen_at: string | null;
          first_seen_session_id: string | null;
          graft: Database["public"]["Enums"]["graft_status"];
          id: string;
          lost_at: string | null;
          org_id: string;
          parcel_id: string;
          sex: Database["public"]["Enums"]["tree_sex"];
          slot_id: string;
          status: Database["public"]["Enums"]["tree_status"];
          stem_form: Database["public"]["Enums"]["stem_form"];
        };
        ComputedFields: never;
        Insert: {
          age_class?: Database["public"]["Enums"]["age_class"];
          created_at?: string;
          cultivar?: string | null;
          first_seen_at?: string | null;
          first_seen_session_id?: string | null;
          graft?: Database["public"]["Enums"]["graft_status"];
          id?: string;
          lost_at?: string | null;
          org_id: string;
          parcel_id: string;
          sex?: Database["public"]["Enums"]["tree_sex"];
          slot_id: string;
          status?: Database["public"]["Enums"]["tree_status"];
          stem_form?: Database["public"]["Enums"]["stem_form"];
        };
        Update: {
          age_class?: Database["public"]["Enums"]["age_class"];
          created_at?: string;
          cultivar?: string | null;
          first_seen_at?: string | null;
          first_seen_session_id?: string | null;
          graft?: Database["public"]["Enums"]["graft_status"];
          id?: string;
          lost_at?: string | null;
          org_id?: string;
          parcel_id?: string;
          sex?: Database["public"]["Enums"]["tree_sex"];
          slot_id?: string;
          status?: Database["public"]["Enums"]["tree_status"];
          stem_form?: Database["public"]["Enums"]["stem_form"];
        };
        Relationships: [
          {
            foreignKeyName: "tree_first_seen_session_id_parcel_id_org_id_fkey";
            columns: ["first_seen_session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "tree_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "tree_slot_id_parcel_id_org_id_fkey";
            columns: ["slot_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "slot";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      trunk_label: {
        Row: {
          azimuth_deg: number;
          created_at: string;
          id: string;
          labelled_at: string;
          labelled_by: string;
          method: string;
          method_version: string | null;
          moved: boolean;
          org_id: string;
          panorama_asset_id: string | null;
          panorama_gps_time_ns: number | null;
          parcel_id: string;
          pitch_deg: number;
          session_id: string;
          slot_id: string | null;
          tree_id: string | null;
          unsure: boolean;
          yaw_deg: number;
        };
        ComputedFields: never;
        Insert: {
          azimuth_deg: number;
          created_at?: string;
          id?: string;
          labelled_at?: string;
          labelled_by?: string;
          method?: string;
          method_version?: string | null;
          moved?: boolean;
          org_id: string;
          panorama_asset_id?: string | null;
          panorama_gps_time_ns?: number | null;
          parcel_id: string;
          pitch_deg: number;
          session_id: string;
          slot_id?: string | null;
          tree_id?: string | null;
          unsure?: boolean;
          yaw_deg: number;
        };
        Update: {
          azimuth_deg?: number;
          created_at?: string;
          id?: string;
          labelled_at?: string;
          labelled_by?: string;
          method?: string;
          method_version?: string | null;
          moved?: boolean;
          org_id?: string;
          panorama_asset_id?: string | null;
          panorama_gps_time_ns?: number | null;
          parcel_id?: string;
          pitch_deg?: number;
          session_id?: string;
          slot_id?: string | null;
          tree_id?: string | null;
          unsure?: boolean;
          yaw_deg?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trunk_label_panorama_asset_id_parcel_id_org_id_fkey";
            columns: ["panorama_asset_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "asset";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "trunk_label_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "trunk_label_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "trunk_label_slot_id_parcel_id_org_id_fkey";
            columns: ["slot_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "slot";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "trunk_label_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      verification_item: {
        Row: {
          checked_at: string | null;
          checked_by: string | null;
          closeup_capture_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          org_id: string;
          parcel_id: string;
          reasons: Database["public"]["Enums"]["verification_reason"][];
          result_note: string | null;
          session_id: string;
          slot_id: string;
          status: Database["public"]["Enums"]["verification_status"];
          tree_id: string | null;
          tree_present: boolean | null;
        };
        ComputedFields: never;
        Insert: {
          checked_at?: string | null;
          checked_by?: string | null;
          closeup_capture_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          org_id: string;
          parcel_id: string;
          reasons: Database["public"]["Enums"]["verification_reason"][];
          result_note?: string | null;
          session_id: string;
          slot_id: string;
          status?: Database["public"]["Enums"]["verification_status"];
          tree_id?: string | null;
          tree_present?: boolean | null;
        };
        Update: {
          checked_at?: string | null;
          checked_by?: string | null;
          closeup_capture_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          org_id?: string;
          parcel_id?: string;
          reasons?: Database["public"]["Enums"]["verification_reason"][];
          result_note?: string | null;
          session_id?: string;
          slot_id?: string;
          status?: Database["public"]["Enums"]["verification_status"];
          tree_id?: string | null;
          tree_present?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "verification_item_closeup_capture_id_parcel_id_org_id_fkey";
            columns: ["closeup_capture_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "capture";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "verification_item_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "verification_item_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "verification_item_slot_id_parcel_id_org_id_fkey";
            columns: ["slot_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "slot";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "verification_item_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      zone: {
        Row: {
          created_at: string;
          geom: unknown;
          id: string;
          kind: Database["public"]["Enums"]["zone_kind"];
          name: string | null;
          org_id: string;
          parcel_id: string;
          position_uncertainty_m: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          geom: unknown;
          id?: string;
          kind: Database["public"]["Enums"]["zone_kind"];
          name?: string | null;
          org_id: string;
          parcel_id: string;
          position_uncertainty_m?: number | null;
        };
        Update: {
          created_at?: string;
          geom?: unknown;
          id?: string;
          kind?: Database["public"]["Enums"]["zone_kind"];
          name?: string | null;
          org_id?: string;
          parcel_id?: string;
          position_uncertainty_m?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "zone_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
    };
    Views: {
      tree_latest_assessment: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          assessed_at: string | null;
          assessed_by: string | null;
          auto_approved: boolean | null;
          confidence: number | null;
          created_at: string | null;
          id: string | null;
          methodology_version: string | null;
          model_name: string | null;
          model_version: string | null;
          notes: string | null;
          org_id: string | null;
          overall_class: Database["public"]["Enums"]["health_class"] | null;
          parcel_id: string | null;
          session_id: string | null;
          session_time: string | null;
          source: Database["public"]["Enums"]["assessment_source"] | null;
          tree_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "assessment_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "assessment_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "assessment_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
      tree_latest_measurement: {
        Row: {
          confidence: number | null;
          created_at: string | null;
          id: string | null;
          measured_at: string | null;
          method: string | null;
          method_version: string | null;
          metric_definition_id: string | null;
          org_id: string | null;
          params_hash: string | null;
          parcel_id: string | null;
          recorded_by: string | null;
          session_id: string | null;
          session_time: string | null;
          slot_id: string | null;
          source: Database["public"]["Enums"]["measurement_source"] | null;
          subject: Database["public"]["Enums"]["measurement_subject"] | null;
          tree_id: string | null;
          uncertainty: number | null;
          unit: string | null;
          value_boolean: boolean | null;
          value_category: string | null;
          value_numeric: number | null;
          value_scale: number | null;
          zone_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "measurement_metric_definition_id_fkey";
            columns: ["metric_definition_id"];
            isOneToOne: false;
            referencedRelation: "metric_definition";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "measurement_parcel_id_org_id_fkey";
            columns: ["parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "parcel";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "measurement_session_id_parcel_id_org_id_fkey";
            columns: ["session_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "session";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_slot_id_parcel_id_org_id_fkey";
            columns: ["slot_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "slot";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_tree_id_parcel_id_org_id_fkey";
            columns: ["tree_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "tree";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
          {
            foreignKeyName: "measurement_zone_id_parcel_id_org_id_fkey";
            columns: ["zone_id", "parcel_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "zone";
            referencedColumns: ["id", "parcel_id", "org_id"];
          },
        ];
      };
    };
    Functions: {
      add_field_survey_boundary: {
        Args: {
          p_ring: Json;
          p_session_id: string;
          p_surveyed_at: string;
          p_vertex_uncertainty_m: number;
        };
        Returns: Json;
      };
      add_owner_declared_boundary: {
        Args: { p_parcel_id: string; p_ring: Json; p_vertex_uncertainty_m?: number };
        Returns: {
          area_m2: number | null;
          created_at: string;
          created_by: string | null;
          geom: unknown;
          id: string;
          org_id: string;
          owner_approved_at: string | null;
          owner_approved_by: string | null;
          parcel_id: string;
          session_id: string | null;
          source: Database["public"]["Enums"]["boundary_source"];
          surveyed_at: string | null;
          version: number;
          vertex_uncertainty_m: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "boundary";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      approve_boundary: {
        Args: { p_boundary_id: string; p_declared?: boolean };
        Returns: {
          area_m2: number | null;
          created_at: string;
          created_by: string | null;
          geom: unknown;
          id: string;
          org_id: string;
          owner_approved_at: string | null;
          owner_approved_by: string | null;
          parcel_id: string;
          session_id: string | null;
          source: Database["public"]["Enums"]["boundary_source"];
          surveyed_at: string | null;
          version: number;
          vertex_uncertainty_m: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "boundary";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      approve_finding: {
        Args: { p_finding_id: string };
        Returns: {
          approved_at: string | null;
          approved_by: string | null;
          assessment_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          kind: string;
          location: unknown;
          org_id: string;
          parcel_id: string;
          position_uncertainty_m: number | null;
          recommendation: string | null;
          session_id: string;
          severity: Database["public"]["Enums"]["finding_severity"];
          tree_id: string | null;
          zone_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "finding";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      approve_inventory: {
        Args: { p_session_id: string };
        Returns: {
          camera_height_m: number | null;
          created_at: string;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["session_kind"];
          lead_user_id: string | null;
          methodology_version: string | null;
          notes: string | null;
          org_id: string;
          parcel_id: string;
          performer: Database["public"]["Enums"]["performer_kind"];
          planned_date: string | null;
          published_at: string | null;
          published_by: string | null;
          rig_id: string | null;
          scan_platform: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["session_status"];
          weather: Json | null;
        };
        SetofOptions: {
          from: "*";
          to: "session";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      boundary_dispute_status: { Args: { p_parcel_id: string }; Returns: Json };
      bulk_approve_trees: {
        Args: { p_items: Json; p_method_version: string; p_session_id: string };
        Returns: number;
      };
      calibration_kit_mount_valid: { Args: { p_extrinsics: Json }; Returns: boolean };
      cancel_followup: { Args: { p_request_id: string }; Returns: undefined };
      close_verification_item: {
        Args: { p_item_id: string; p_note: string };
        Returns: {
          checked_at: string | null;
          checked_by: string | null;
          closeup_capture_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          org_id: string;
          parcel_id: string;
          reasons: Database["public"]["Enums"]["verification_reason"][];
          result_note: string | null;
          session_id: string;
          slot_id: string;
          status: Database["public"]["Enums"]["verification_status"];
          tree_id: string | null;
          tree_present: boolean | null;
        };
        SetofOptions: {
          from: "*";
          to: "verification_item";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      closeup_list: {
        Args: { p_session_id: string };
        Returns: {
          position_no: number;
          reasons: string[];
          row_no: number;
          slot_code: string;
          slot_id: string;
          tree_id: string;
        }[];
      };
      contract_visit_windows: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          end_month: number;
          name: string;
          start_month: number;
        }[];
      };
      create_verification_tour: {
        Args: { p_items: Json; p_notes?: string; p_parcel_id: string; p_planned_date?: string };
        Returns: Json;
      };
      customer_accept_quote: { Args: { p_consents: Json; p_quote_id: string }; Returns: string };
      customer_addon_preview: {
        Args: { p_areas_m2: number[] };
        Returns: {
          area_m2: number;
          base_order_id: string;
          basis: string;
          billable_area_tenths: number;
          full_year_total_kurus: number;
          inventory_fee_kurus: number;
          line_base_kurus: number;
          line_discount_kurus: number;
          line_no: number;
          line_subtotal_kurus: number;
          line_total_kurus: number;
          line_vat_kurus: number;
          minimum_fee_kurus: number;
          periodic_visits_per_year: number;
          price_list_id: string;
          price_list_name: string;
          price_list_version: number;
          raw_visits: number;
          remaining_windows: Json;
          service_end: string;
          service_start: string;
          unit_price_kurus: number;
          valid_from: string;
          vat_rate_bp: number;
          visit_amount_kurus: number;
          visits: number;
        }[];
      };
      customer_application_garden_detail: {
        Args: { p_garden_id: string };
        Returns: {
          access_note: string;
          application_garden_id: string;
          authorization_basis: string;
          deed_block: string;
          deed_parcel: string;
          entry_permission_at: string;
          is_shared_deed: boolean;
          site_contact_name: string;
          site_contact_phone: string;
          updated_at: string;
          used_portion_note: string;
        }[];
      };
      customer_cancel_garden_removal: { Args: { p_removal_id: string }; Returns: undefined };
      customer_cancel_order: { Args: { p_order_id: string }; Returns: undefined };
      customer_create_application: { Args: { p_package_id?: string }; Returns: string };
      customer_decline_quote: {
        Args: { p_note?: string; p_quote_id: string; p_request_revision?: boolean };
        Returns: undefined;
      };
      customer_garden_removal_preview: {
        Args: { p_at_period_end?: boolean; p_parcel_id: string; p_withdrawal?: boolean };
        Returns: {
          access_until: string;
          effective_on: string;
          line_count: number;
          order_item_id: string;
          refund_estimate_kurus: number;
          visits_entitled: number;
          visits_used: number;
          withdrawal: boolean;
          withdrawal_until: string;
        }[];
      };
      customer_payment_instructions: {
        Args: { p_order_id: string };
        Returns: {
          bank_name: string;
          currency: string;
          iban: string;
          iban_holder: string;
          outstanding_kurus: number;
          payment_due_at: string;
          reference: string;
        }[];
      };
      customer_remove_application_garden: { Args: { p_garden_id: string }; Returns: undefined };
      customer_request_garden_removal: {
        Args: {
          p_at_period_end?: boolean;
          p_note?: string;
          p_parcel_id: string;
          p_reason: string;
          p_withdrawal?: boolean;
        };
        Returns: string;
      };
      customer_revise_order: { Args: { p_note?: string; p_order_id: string }; Returns: string };
      customer_save_application_garden: {
        Args: { p_application_id: string; p_detail: Json; p_garden: Json; p_garden_id?: string };
        Returns: string;
      };
      customer_save_billing_profile: { Args: { p_profile: Json }; Returns: undefined };
      customer_set_application_package: {
        Args: { p_application_id: string; p_customer_note?: string; p_package_id: string };
        Returns: undefined;
      };
      customer_set_consent: {
        Args: { p_granted: boolean; p_kind: string; p_text_version: string };
        Returns: undefined;
      };
      customer_submit_application: { Args: { p_application_id: string }; Returns: string };
      customer_update_contact: {
        Args: { p_contact_preference: string; p_email: string; p_full_name: string };
        Returns: undefined;
      };
      customer_withdraw_application: { Args: { p_application_id: string }; Returns: undefined };
      customer_withdraw_application_garden: { Args: { p_garden_id: string }; Returns: undefined };
      demo_admit: { Args: { p_ip_hash: string }; Returns: Json };
      demo_end: { Args: Record<PropertyKey, never>; Returns: undefined };
      demo_expired_accounts: {
        Args: { p_exclude?: string[]; p_limit?: number };
        Returns: string[];
      };
      demo_hit: { Args: { p_kind: string }; Returns: boolean };
      demo_info: { Args: Record<PropertyKey, never>; Returns: Json };
      demo_purge_audit_log: { Args: { p_user_ids: string[] }; Returns: number };
      demo_start: { Args: { p_ip_hash: string; p_user_id: string }; Returns: Json };
      demo_undeletable_count: { Args: Record<PropertyKey, never>; Returns: number };
      legal_gate_status: {
        Args: { p_org_id?: string };
        Returns: {
          active: boolean;
          reasons: string[];
        }[];
      };
      message_outbox_list: {
        Args: { p_limit?: number; p_recipient: string };
        Returns: {
          body: string;
          channel: string;
          created_at: string;
          id: string;
          notification_id: string;
          purpose: string;
          recipient: string;
        }[];
      };
      message_outbox_record: {
        Args: {
          p_body: string;
          p_channel: string;
          p_notification_id?: string;
          p_purpose: string;
          p_recipient: string;
        };
        Returns: string;
      };
      my_billing_profile: {
        Args: Record<PropertyKey, never>;
        Returns: {
          address: string;
          city: string;
          company_title: string;
          country: string;
          district: string;
          email: string;
          first_name: string;
          has_profile: boolean;
          identity_number_masked: string;
          identity_number_required: boolean;
          kind: string;
          last_name: string;
          org_id: string;
          postal_code: string;
          tax_number: string;
          tax_office: string;
          updated_at: string;
        }[];
      };
      my_consents: {
        Args: Record<PropertyKey, never>;
        Returns: {
          granted: boolean;
          kind: string;
          org_id: string;
          recorded_at: string;
          source: string;
          text_version: string;
        }[];
      };
      my_contract_documents: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          id: string;
          kind: string;
          order_id: string;
          order_number: string;
          quote_id: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          text_sha256: string;
          text_version: string;
        }[];
      };
      my_gardens: {
        Args: Record<PropertyKey, never>;
        Returns: {
          access_until: string;
          base_order_id: string;
          garden_name: string;
          in_next_period: boolean;
          is_addon: boolean;
          next_order_item_id: string;
          order_id: string;
          order_item_id: string;
          order_number: string;
          order_status: Database["public"]["Enums"]["order_status"];
          parcel_id: string;
          parcel_status: Database["public"]["Enums"]["parcel_status"];
          removal_effective_on: string;
          removal_id: string;
          removal_initiated_by: string;
          removal_number: string;
          removal_status: Database["public"]["Enums"]["garden_removal_status"];
          removed_on: string;
          service_end: string;
          service_start: string;
          state: string;
          visits_entitled: number;
          visits_used: number;
          withdrawal_until: string;
        }[];
      };
      my_owner_profile: {
        Args: Record<PropertyKey, never>;
        Returns: {
          contact_preference: string;
          email: string;
          full_name: string;
          kvkk_consent: boolean;
          kvkk_consent_at: string;
          org_id: string;
          phone: string;
        }[];
      };
      my_service_period: {
        Args: Record<PropertyKey, never>;
        Returns: {
          addon_base_order_id: string;
          addon_until: string;
          base_order_id: string;
          base_order_number: string;
          garden_changes_enabled: boolean;
          garden_count: number;
          is_primary: boolean;
          next_base_order_id: string;
          next_period_end: string;
          next_period_start: string;
          org_id: string;
          package_id: string;
          package_name: string;
          period_count: number;
          period_end: string;
          period_start: string;
          periodic_visits_per_year: number;
          renewal_quote_id: string;
        }[];
      };
      notification_claim: {
        Args: { p_limit?: number };
        Returns: {
          attempts: number;
          channel: string;
          id: string;
          phone: string;
          template: string;
          vars: Json;
        }[];
      };
      notification_report: {
        Args: {
          p_error?: string;
          p_id: string;
          p_outcome: string;
          p_provider_message_id?: string;
          p_retry_at?: string;
          p_sent_via?: string;
        };
        Returns: undefined;
      };
      ops_application_garden_detail: {
        Args: { p_garden_id: string };
        Returns: {
          access_note: string;
          application_garden_id: string;
          authorization_basis: string;
          deed_block: string;
          deed_parcel: string;
          entry_permission_at: string;
          is_shared_deed: boolean;
          site_contact_name: string;
          site_contact_phone: string;
          updated_at: string;
          used_portion_note: string;
        }[];
      };
      ops_applications: {
        Args: { p_limit?: number; p_org_id: string; p_status?: string };
        Returns: {
          created_at: string;
          customer_name: string;
          customer_user_id: string;
          decided_at: string;
          declared_area_m2: number;
          garden_count: number;
          id: string;
          number: string;
          open_quote_id: string;
          package_id: string;
          package_name: string;
          rejection_reason: string;
          status: string;
          submitted_at: string;
          verified_garden_count: number;
        }[];
      };
      ops_audit_events: {
        Args: {
          p_action_prefix?: string;
          p_entity_id?: string;
          p_entity_type?: string;
          p_limit?: number;
          p_org_id: string;
        };
        Returns: {
          action: string;
          actor_name: string;
          actor_role: string;
          actor_user_id: string;
          created_at: string;
          details: Json;
          entity_id: string;
          entity_type: string;
          id: string;
        }[];
      };
      ops_billing_internal: { Args: { p_entity_id: string; p_entity_type: string }; Returns: Json };
      ops_billing_profile: {
        Args: { p_org_id: string; p_reveal?: boolean; p_user_id: string };
        Returns: {
          address: string;
          city: string;
          company_title: string;
          country: string;
          district: string;
          email: string;
          first_name: string;
          identity_number: string;
          identity_number_masked: string;
          kind: string;
          last_name: string;
          postal_code: string;
          tax_number: string;
          tax_office: string;
          updated_at: string;
          user_id: string;
        }[];
      };
      ops_billing_setting: {
        Args: { p_org_id: string };
        Returns: {
          accepts_signups: boolean;
          addon_min_days: number;
          address: string | null;
          allow_fake_payments: boolean;
          bank_name: string | null;
          boundary_declaration_required: boolean;
          coowner_notice_flow_enabled: boolean;
          created_at: string;
          email: string | null;
          garden_changes_enabled: boolean;
          iban: string | null;
          iban_holder: string | null;
          identity_number_required: boolean;
          inventory_reuse_months: number;
          kep_address: string | null;
          kvkk_email: string | null;
          kvkk_request_form_enabled: boolean;
          legal_gate_enforced: boolean;
          legal_name: string | null;
          marketing_consent_enabled: boolean;
          mersis_number: string | null;
          org_id: string;
          payment_due_days: number;
          phone: string | null;
          quote_valid_days: number;
          removal_access_days: number;
          removal_notice_days: number;
          removal_refund_mode: string;
          renewal_notice_days: number;
          site_domain: string | null;
          tax_number: string | null;
          tax_office: string | null;
          updated_at: string;
          updated_by: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "org_billing_setting";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      ops_billing_summary: {
        Args: { p_org_id: string };
        Returns: {
          applications_submitted: number;
          garden_removals_blocked: number;
          garden_removals_due: number;
          garden_removals_requested: number;
          orders_awaiting_payment: number;
          orders_overdue: number;
          parcels_awaiting_inventory: number;
          payments_pending_review: number;
          quotes_open: number;
          refunds_failed: number;
          refunds_open: number;
          renewals_due: number;
          signup_attempts_24h: number;
        }[];
      };
      ops_can_process_refund: { Args: { p_refund_id: string }; Returns: boolean };
      ops_cancel_garden_removal: {
        Args: { p_note: string; p_removal_id: string };
        Returns: undefined;
      };
      ops_cancel_order: { Args: { p_note?: string; p_order_id: string }; Returns: undefined };
      ops_cancel_refund: { Args: { p_note?: string; p_refund_id: string }; Returns: undefined };
      ops_close_boundary_dispute: {
        Args: { p_note?: string; p_parcel_id: string };
        Returns: string;
      };
      ops_complete_garden_removal: { Args: { p_removal_id: string }; Returns: undefined };
      ops_complete_manual_refund: {
        Args: { p_bank_reference: string; p_completed_on: string; p_refund_id: string };
        Returns: undefined;
      };
      ops_contract_documents: {
        Args: { p_order_id: string };
        Returns: {
          consent_ids: string[];
          created_at: string;
          generator: string;
          id: string;
          kind: string;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          text_sha256: string;
          text_version: string;
        }[];
      };
      ops_create_owner_profile: {
        Args: {
          p_contact_preference: string;
          p_email?: string;
          p_full_name: string;
          p_kvkk_consent: boolean;
          p_kvkk_consent_at?: string;
          p_kvkk_text_version?: string;
          p_org_id: string;
          p_phone?: string;
          p_user_id: string;
        };
        Returns: string;
      };
      ops_create_price_list_draft: {
        Args: { p_copy_from_id?: string; p_org_id: string };
        Returns: string;
      };
      ops_customer: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: {
          application_count: number;
          created_at: string;
          email: string;
          full_name: string;
          has_billing_profile: boolean;
          open_order_count: number;
          paid_kurus: number;
          parcel_count: number;
          phone: string;
          profile_id: string;
          signup_source: string;
          user_id: string;
        }[];
      };
      ops_customer_applications: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: {
          created_at: string;
          customer_name: string;
          customer_user_id: string;
          decided_at: string;
          declared_area_m2: number;
          garden_count: number;
          id: string;
          number: string;
          open_quote_id: string;
          package_id: string;
          package_name: string;
          rejection_reason: string;
          status: string;
          submitted_at: string;
          verified_garden_count: number;
        }[];
      };
      ops_customer_consents: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: {
          granted: boolean;
          id: string;
          kind: string;
          order_id: string;
          quote_id: string;
          recorded_at: string;
          source: string;
          text_version: string;
        }[];
      };
      ops_customer_gardens: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: {
          access_until: string;
          base_order_id: string;
          garden_name: string;
          in_next_period: boolean;
          is_addon: boolean;
          next_order_item_id: string;
          order_id: string;
          order_item_id: string;
          order_number: string;
          order_status: Database["public"]["Enums"]["order_status"];
          parcel_id: string;
          parcel_status: Database["public"]["Enums"]["parcel_status"];
          removal_effective_on: string;
          removal_id: string;
          removal_initiated_by: string;
          removal_number: string;
          removal_status: Database["public"]["Enums"]["garden_removal_status"];
          removed_on: string;
          service_end: string;
          service_start: string;
          state: string;
          visits_entitled: number;
          visits_used: number;
          withdrawal_until: string;
        }[];
      };
      ops_customer_service_period: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: {
          addon_base_order_id: string;
          addon_until: string;
          base_order_id: string;
          base_order_number: string;
          garden_changes_enabled: boolean;
          garden_count: number;
          is_primary: boolean;
          next_base_order_id: string;
          next_period_end: string;
          next_period_start: string;
          org_id: string;
          package_id: string;
          package_name: string;
          period_count: number;
          period_end: string;
          period_start: string;
          periodic_visits_per_year: number;
          renewal_quote_id: string;
        }[];
      };
      ops_customers: {
        Args: { p_limit?: number; p_org_id: string; p_query?: string };
        Returns: {
          application_count: number;
          created_at: string;
          email: string;
          full_name: string;
          has_billing_profile: boolean;
          open_order_count: number;
          paid_kurus: number;
          parcel_count: number;
          phone: string;
          profile_id: string;
          signup_source: string;
          user_id: string;
        }[];
      };
      ops_delete_price_list_draft: { Args: { p_price_list_id: string }; Returns: undefined };
      ops_extend_payment_due: {
        Args: { p_due_on: string; p_order_id: string };
        Returns: undefined;
      };
      ops_find_user_id: {
        Args: { p_email?: string; p_org_id: string; p_phone?: string };
        Returns: string;
      };
      ops_garden_overlaps: {
        Args: { p_garden_id: string };
        Returns: {
          distance_m: number;
          in_service: boolean;
          inside_boundary: boolean;
          parcel_id: string;
          parcel_name: string;
          parcel_status: Database["public"]["Enums"]["parcel_status"];
          same_customer: boolean;
        }[];
      };
      ops_garden_removal_preview: {
        Args: { p_effective_on?: string; p_removal_id: string };
        Returns: Json;
      };
      ops_garden_removals: {
        Args: { p_limit?: number; p_org_id: string; p_status?: string };
        Returns: {
          access_days: number;
          access_revoked_at: string;
          access_until: string;
          at_period_end: boolean;
          blocked_reason: string;
          cancelled_at: string;
          completed_at: string;
          customer_name: string;
          customer_note: string;
          customer_user_id: string;
          effective_on: string;
          garden_name: string;
          id: string;
          initiated_by: string;
          number: string;
          ops_note: string;
          order_id: string;
          order_item_id: string;
          order_number: string;
          parcel_id: string;
          planned_visits_after: number;
          planned_visits_before: number;
          reason: Database["public"]["Enums"]["garden_removal_reason"];
          refund_kurus: number;
          refund_mode: string;
          requested_at: string;
          requested_effective_on: string;
          revoke_all_access: boolean;
          scheduled_at: string;
          status: Database["public"]["Enums"]["garden_removal_status"];
          withdrawal: boolean;
        }[];
      };
      ops_hide_media: {
        Args: { p_id: string; p_note?: string; p_reason: string };
        Returns: string;
      };
      ops_issue_addon_quote: {
        Args: {
          p_application_id?: string;
          p_base_order_id: string;
          p_discount_bp?: number;
          p_discount_note?: string;
          p_new_inventory?: Json;
          p_note_to_customer?: string;
          p_parcel_ids?: string[];
          p_proposed_service_start?: string;
          p_valid_days?: number;
        };
        Returns: string;
      };
      ops_issue_parcel_quote: {
        Args: {
          p_customer_user_id: string;
          p_discount_bp?: number;
          p_discount_note?: string;
          p_first_year: boolean;
          p_note_to_customer?: string;
          p_org_id: string;
          p_package_id: string;
          p_parcel_ids: string[];
          p_proposed_service_start: string;
          p_renewal_of_order_id?: string;
          p_valid_days?: number;
        };
        Returns: string;
      };
      ops_issue_quote: {
        Args: {
          p_application_id: string;
          p_discount_bp?: number;
          p_discount_note?: string;
          p_note_to_customer?: string;
          p_proposed_service_start?: string;
          p_valid_days?: number;
        };
        Returns: string;
      };
      ops_link_application_garden_parcel: {
        Args: { p_garden_id: string; p_parcel_id: string };
        Returns: undefined;
      };
      ops_media_suppressions: {
        Args: { p_parcel_id?: string; p_session_id?: string };
        Returns: {
          action: string;
          actor_email: string;
          created_at: string;
          hidden_now: boolean;
          id: string;
          kind: string;
          note: string;
          org_id: string;
          parcel_id: string;
          reason: string;
          session_id: string;
          target_id: string;
          target_table: string;
          uri: string;
        }[];
      };
      ops_notifications: {
        Args: { p_limit?: number; p_status?: string };
        Returns: {
          attempts: number;
          channel: string;
          created_at: string;
          id: string;
          last_error: string;
          next_attempt_at: string;
          org_id: string;
          parcel_id: string;
          parcel_name: string;
          recipient_name: string;
          recipient_phone: string;
          recipient_role: string;
          recipient_user_id: string;
          ref: string;
          sent_at: string;
          sent_via: string;
          session_id: string;
          status: string;
          template: string;
        }[];
      };
      ops_open_boundary_dispute: { Args: { p_note: string; p_parcel_id: string }; Returns: string };
      ops_orders: {
        Args: {
          p_customer_user_id?: string;
          p_limit?: number;
          p_org_id: string;
          p_status?: string;
        };
        Returns: {
          activated_at: string;
          addon_of_order_id: string;
          application_id: string;
          cancel_reason: string;
          cancelled_at: string;
          completed_at: string;
          created_at: string;
          currency: string;
          customer_name: string;
          customer_user_id: string;
          id: string;
          live_payment: boolean;
          number: string;
          overdue: boolean;
          package_name: string;
          paid_kurus: number;
          payment_due_at: string;
          quote_id: string;
          quote_number: string;
          refunded_kurus: number;
          renewal_due: boolean;
          renewal_of_order_id: string;
          service_end: string;
          service_start: string;
          status: string;
          terminated_at: string;
          total_kurus: number;
        }[];
      };
      ops_orders_missing_contract_documents: {
        Args: Record<PropertyKey, never>;
        Returns: {
          accepted_at: string;
          activated_at: string;
          customer_user_id: string;
          missing: string[];
          order_id: string;
          order_number: string;
          org_id: string;
          status: Database["public"]["Enums"]["order_status"];
        }[];
      };
      ops_org_members: {
        Args: { p_org_id: string };
        Returns: {
          email: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        }[];
      };
      ops_owner_profiles: {
        Args: { p_profile_id?: string };
        Returns: {
          contact_preference: string;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          kvkk_consent: boolean;
          kvkk_consent_at: string;
          kvkk_text_version: string;
          org_id: string;
          phone: string;
          updated_at: string;
          user_id: string;
        }[];
      };
      ops_parcel_access: {
        Args: { p_parcel_id: string };
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          profile_id: string;
          role: Database["public"]["Enums"]["parcel_role"];
          user_id: string;
        }[];
      };
      ops_parcel_detail: {
        Args: { p_parcel_id: string };
        Returns: {
          access_note: string;
          authorization_basis: string;
          deed_block: string;
          deed_parcel: string;
          entry_permission_at: string;
          is_shared_deed: boolean;
          parcel_id: string;
          site_contact_name: string;
          site_contact_phone: string;
          updated_at: string;
          used_portion_note: string;
        }[];
      };
      ops_payment_events: {
        Args: { p_payment_id: string };
        Returns: {
          dedup_key: string;
          event_type: string;
          http_status: number;
          id: string;
          outcome: string;
          payload: Json;
          provider: string;
          received_at: string;
          refund_id: string;
          signature_valid: boolean;
        }[];
      };
      ops_payments: {
        Args: { p_limit?: number; p_order_id?: string; p_org_id: string; p_status?: string };
        Returns: {
          amount_kurus: number;
          bank_reference: string;
          card_association: string;
          card_last4: string;
          currency: string;
          customer_name: string;
          customer_user_id: string;
          failed_at: string;
          failure_code: string;
          fraud_status: number;
          id: string;
          initiated_at: string;
          installment: number;
          order_id: string;
          order_number: string;
          paid_kurus: number;
          provider: string;
          provider_amount_kurus: number;
          receipt_number: string;
          refundable_kurus: number;
          refunded_kurus: number;
          status: string;
          succeeded_at: string;
          token_expires_at: string;
          value_date: string;
          voided_at: string;
        }[];
      };
      ops_plan_followups: {
        Args: { p_request_ids: string[]; p_session_id: string };
        Returns: number;
      };
      ops_preview_addon_quote: {
        Args: {
          p_application_id?: string;
          p_base_order_id: string;
          p_discount_bp?: number;
          p_new_inventory?: Json;
          p_parcel_ids?: string[];
          p_proposed_service_start?: string;
        };
        Returns: {
          application_garden_id: string;
          area_m2: number;
          area_source: string;
          basis: string;
          billable_area_tenths: number;
          full_year_total_kurus: number;
          garden_name: string;
          inventory: boolean;
          inventory_fee_kurus: number;
          inventory_note: string;
          inventory_reason: string;
          last_inventory_on: string;
          line_base_kurus: number;
          line_discount_kurus: number;
          line_no: number;
          line_subtotal_kurus: number;
          line_total_kurus: number;
          line_vat_kurus: number;
          minimum_fee_kurus: number;
          parcel_id: string;
          periodic_visits_per_year: number;
          price_list_id: string;
          price_list_name: string;
          price_list_version: number;
          raw_visits: number;
          remaining_windows: Json;
          service_end: string;
          service_start: string;
          unit_price_kurus: number;
          vat_rate_bp: number;
          visit_amount_kurus: number;
          visits: number;
        }[];
      };
      ops_preview_quote: {
        Args: { p_application_id: string; p_discount_bp?: number };
        Returns: {
          application_garden_id: string;
          area_m2: number;
          area_source: string;
          billable_area_tenths: number;
          garden_name: string;
          inventory_fee_kurus: number;
          line_base_kurus: number;
          line_discount_kurus: number;
          line_no: number;
          line_subtotal_kurus: number;
          line_total_kurus: number;
          line_vat_kurus: number;
          minimum_fee_kurus: number;
          price_list_id: string;
          price_list_version: number;
          unit_price_kurus: number;
          vat_rate_bp: number;
          visit_amount_kurus: number;
          visits: number;
        }[];
      };
      ops_publish_price_list: { Args: { p_price_list_id: string }; Returns: number };
      ops_record_manual_payment: {
        Args: {
          p_amount_kurus: number;
          p_bank_reference: string;
          p_note?: string;
          p_order_id: string;
          p_value_date: string;
        };
        Returns: string;
      };
      ops_record_withdrawal: {
        Args: {
          p_channel: string;
          p_note?: string;
          p_notice_received_on: string;
          p_order_item_ids: string[];
        };
        Returns: string[];
      };
      ops_refunds: {
        Args: { p_limit?: number; p_org_id: string; p_payment_id?: string; p_status?: string };
        Returns: {
          amount_kurus: number;
          attempts: number;
          bank_reference: string;
          by_system: boolean;
          completed_on: string;
          currency: string;
          customer_name: string;
          customer_user_id: string;
          failure_code: string;
          id: string;
          kind: string;
          number: string;
          order_id: string;
          order_number: string;
          payment_id: string;
          payment_item_id: string;
          processed_at: string;
          processing_since: string;
          provider: string;
          provider_ref: string;
          reason: string;
          requested_at: string;
          retryable: boolean;
          status: string;
          uncertain: boolean;
        }[];
      };
      ops_reject_application: {
        Args: { p_application_id: string; p_note?: string; p_reason: string };
        Returns: undefined;
      };
      ops_request_garden_removal: {
        Args: {
          p_access_days?: number;
          p_effective_on: string;
          p_note?: string;
          p_order_item_id: string;
          p_reason: string;
          p_revoke_all_access?: boolean;
        };
        Returns: string;
      };
      ops_request_refund: {
        Args: {
          p_amount_kurus: number;
          p_note?: string;
          p_payment_id: string;
          p_payment_item_id?: string;
          p_reason: string;
        };
        Returns: string[];
      };
      ops_resolve_payment_review: {
        Args: {
          p_note?: string;
          p_payment_id: string;
          p_provider_ref: string;
          p_succeeded: boolean;
        };
        Returns: undefined;
      };
      ops_resolve_refund: {
        Args: {
          p_note?: string;
          p_provider_ref?: string;
          p_refund_id: string;
          p_succeeded: boolean;
        };
        Returns: undefined;
      };
      ops_resolve_viewer_invitation: {
        Args: { p_approve: boolean; p_invitation_id: string; p_user_id?: string };
        Returns: undefined;
      };
      ops_retry_notification: { Args: { p_id: string }; Returns: undefined };
      ops_save_billing_setting: {
        Args: { p_org_id: string; p_settings: Json };
        Returns: undefined;
      };
      ops_save_package: { Args: { p_org_id: string; p_package: Json }; Returns: string };
      ops_save_parcel_detail: {
        Args: {
          p_access_note?: string;
          p_authorization_basis?: string;
          p_deed_block?: string;
          p_deed_parcel?: string;
          p_entry_permission_at?: string;
          p_is_shared_deed?: boolean;
          p_parcel_id: string;
          p_site_contact_name?: string;
          p_site_contact_phone?: string;
          p_used_portion_note?: string;
        };
        Returns: undefined;
      };
      ops_save_price_list_draft: {
        Args: {
          p_items: Json;
          p_note: string;
          p_price_list_id: string;
          p_valid_from: string;
          p_vat_rate_bp: number;
        };
        Returns: undefined;
      };
      ops_save_staff_profile: {
        Args: { p_full_name: string; p_org_id: string; p_title: string; p_user_id: string };
        Returns: undefined;
      };
      ops_schedule_garden_removal: {
        Args: {
          p_access_days?: number;
          p_effective_on: string;
          p_note?: string;
          p_removal_id: string;
          p_revoke_all_access?: boolean;
        };
        Returns: undefined;
      };
      ops_set_parcel_passive: {
        Args: { p_parcel_id: string; p_passive: boolean };
        Returns: Database["public"]["Enums"]["parcel_status"];
      };
      ops_staff: {
        Args: { p_org_id: string };
        Returns: {
          email: string;
          full_name: string;
          roles: string[];
          title: string;
          updated_at: string;
          user_id: string;
        }[];
      };
      ops_terminate_order: { Args: { p_note: string; p_order_id: string }; Returns: undefined };
      ops_unhide_media: { Args: { p_id: string; p_note?: string }; Returns: string };
      ops_update_owner_profile: {
        Args: {
          p_contact_preference: string;
          p_email?: string;
          p_full_name: string;
          p_kvkk_consent: boolean;
          p_kvkk_consent_at?: string;
          p_kvkk_text_version?: string;
          p_phone?: string;
          p_profile_id: string;
        };
        Returns: undefined;
      };
      ops_verify_application_garden: {
        Args: {
          p_boundary?: Json;
          p_garden_id: string;
          p_note?: string;
          p_verified_area_m2: number;
        };
        Returns: undefined;
      };
      ops_viewer_invitations: {
        Args: { p_org_id: string };
        Returns: {
          created_at: string;
          full_name: string;
          id: string;
          invited_by_name: string;
          parcel_id: string;
          parcel_name: string;
          phone: string;
        }[];
      };
      ops_void_manual_payment: {
        Args: { p_note: string; p_payment_id: string };
        Returns: undefined;
      };
      ops_withdraw_application_garden: {
        Args: { p_garden_id: string; p_note: string };
        Returns: undefined;
      };
      owner_cancel_viewer_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      owner_invite_viewer: {
        Args: { p_declared?: boolean; p_full_name: string; p_parcel_id: string; p_phone: string };
        Returns: string;
      };
      owner_parcel_viewers: {
        Args: { p_parcel_id: string };
        Returns: {
          created_at: string;
          full_name: string;
          id: string;
          kind: string;
          phone_last2: string;
          status: string;
          user_id: string;
        }[];
      };
      parcel_legal_flags: { Args: { p_parcel_id: string }; Returns: Json };
      parcel_service_status: {
        Args: { p_parcel_id: string };
        Returns: {
          access_until: string;
          leaving_on: string;
          removed_on: string;
          status: string;
        }[];
      };
      payment_attach_token: {
        Args: {
          p_expires_at: string;
          p_identity_number_last4?: string;
          p_payment_id: string;
          p_token: string;
        };
        Returns: undefined;
      };
      payment_attempts_to_reconcile: {
        Args: { p_limit?: number };
        Returns: {
          amount_kurus: number;
          currency: string;
          id: string;
          order_id: string;
          provider: string;
          provider_token: string;
          status: string;
          token_expires_at: string;
        }[];
      };
      payment_begin: {
        Args: {
          p_order_id: string;
          p_provider: string;
          p_return_origin: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      payment_by_token: {
        Args: { p_token: string };
        Returns: {
          amount_kurus: number;
          currency: string;
          id: string;
          order_id: string;
          provider: string;
          return_origin: string;
          status: string;
          token_expires_at: string;
        }[];
      };
      payment_finalize: {
        Args: { p_outcome: string; p_payment_id: string; p_result: Json };
        Returns: string;
      };
      payment_record_event: {
        Args: {
          p_dedup_key: string;
          p_event_type: string;
          p_http_status: number;
          p_outcome: string;
          p_payload: Json;
          p_payment_id: string;
          p_provider: string;
          p_refund_id: string;
          p_signature_valid: boolean;
        };
        Returns: boolean;
      };
      payment_refund_claim: { Args: { p_refund_id: string }; Returns: Json };
      payment_refund_report: {
        Args: {
          p_failure_code?: string;
          p_kind: string;
          p_outcome: string;
          p_provider_ref?: string;
          p_refund_id: string;
          p_retryable?: boolean;
        };
        Returns: undefined;
      };
      phone_login_allowed: { Args: { p_phone: string }; Returns: boolean };
      phone_login_code_requested: { Args: { p_phone: string }; Returns: string };
      phone_login_record_failure: { Args: { p_phone: string }; Returns: number };
      pipeline_rescan_request: { Args: { p_session_id: string }; Returns: Json };
      portal_acknowledge_kvkk_notice: { Args: { p_text_version: string }; Returns: number };
      portal_notice_status: { Args: Record<PropertyKey, never>; Returns: Json };
      price_preview: {
        Args: { p_areas_m2: number[]; p_first_year?: boolean; p_package_id: string };
        Returns: {
          area_m2: number;
          billable_area_tenths: number;
          inventory_fee_kurus: number;
          line_base_kurus: number;
          line_discount_kurus: number;
          line_no: number;
          line_subtotal_kurus: number;
          line_total_kurus: number;
          line_vat_kurus: number;
          minimum_fee_kurus: number;
          price_list_id: string;
          price_list_version: number;
          unit_price_kurus: number;
          valid_from: string;
          vat_rate_bp: number;
          visit_amount_kurus: number;
          visits: number;
        }[];
      };
      public_company_info: {
        Args: Record<PropertyKey, never>;
        Returns: {
          address: string;
          complete: boolean;
          email: string;
          kep_address: string;
          kvkk_email: string;
          legal_name: string;
          mersis_number: string;
          phone: string;
          site_domain: string;
          tax_number: string;
          tax_office: string;
        }[];
      };
      public_package_prices: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          currency: string;
          description: string;
          includes_inventory: boolean;
          inventory_fee_kurus: number;
          minimum_fee_kurus: number;
          name: string;
          package_id: string;
          periodic_visits_per_year: number;
          price_list_version: number;
          unit_price_kurus: number;
          valid_from: string;
          vat_rate_bp: number;
        }[];
      };
      publish_session: {
        Args: { p_session_id: string };
        Returns: {
          camera_height_m: number | null;
          created_at: string;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          kind: Database["public"]["Enums"]["session_kind"];
          lead_user_id: string | null;
          methodology_version: string | null;
          notes: string | null;
          org_id: string;
          parcel_id: string;
          performer: Database["public"]["Enums"]["performer_kind"];
          planned_date: string | null;
          published_at: string | null;
          published_by: string | null;
          rig_id: string | null;
          scan_platform: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["session_status"];
          weather: Json | null;
        };
        SetofOptions: {
          from: "*";
          to: "session";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      receipt_data: { Args: { p_payment_id: string }; Returns: Json };
      record_coverage_report: { Args: { p_report: Json; p_session_id: string }; Returns: Json };
      record_tree_presence: { Args: { p_payload: Json; p_session_id: string }; Returns: Json };
      record_verification_result: {
        Args: {
          p_closeup_capture_id?: string;
          p_item_id: string;
          p_note?: string;
          p_tree_present: boolean;
        };
        Returns: {
          checked_at: string | null;
          checked_by: string | null;
          closeup_capture_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          org_id: string;
          parcel_id: string;
          reasons: Database["public"]["Enums"]["verification_reason"][];
          result_note: string | null;
          session_id: string;
          slot_id: string;
          status: Database["public"]["Enums"]["verification_status"];
          tree_id: string | null;
          tree_present: boolean | null;
        };
        SetofOptions: {
          from: "*";
          to: "verification_item";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      register_parcel: {
        Args: {
          p_boundary?: Json;
          p_detail?: Json;
          p_org_id: string;
          p_owner_user_id?: string;
          p_parcel: Json;
        };
        Returns: string;
      };
      registered_legal_text_versions: {
        Args: Record<PropertyKey, never>;
        Returns: {
          is_current: boolean;
          is_final: boolean;
          kind: string;
          sha256: string;
          version: string;
        }[];
      };
      request_followup: {
        Args: {
          p_kind: Database["public"]["Enums"]["followup_kind"];
          p_note?: string;
          p_session_id: string;
          p_tree_id?: string;
        };
        Returns: string;
      };
      save_ai_assessment: {
        Args: {
          p_confidence: number;
          p_detail: Json;
          p_evidence_asset_ids: string[];
          p_measurements: Json;
          p_methodology_version: string;
          p_model_name: string;
          p_model_version: string;
          p_notes: string;
          p_overall_class: Database["public"]["Enums"]["health_class"];
          p_session_id: string;
          p_tree_id: string;
        };
        Returns: string;
      };
      save_expert_assessment: {
        Args: {
          p_evidence_asset_ids: string[];
          p_measurements: Json;
          p_method_version: string;
          p_notes?: string;
          p_overall_class: Database["public"]["Enums"]["health_class"];
          p_session_id: string;
          p_tree_id: string;
        };
        Returns: string;
      };
      save_inventory: {
        Args: {
          p_corner: Database["public"]["Enums"]["corner"];
          p_method_version?: string;
          p_parcel_id: string;
          p_row_azimuth_deg: number;
          p_session_id: string;
          p_slots: Json;
        };
        Returns: Json;
      };
      save_parcel_route: {
        Args: {
          p_content_hash: string;
          p_id: string;
          p_parcel_id: string;
          p_route: Json;
          p_session_id: string;
        };
        Returns: Json;
      };
      service_register_contract_document: {
        Args: {
          p_generator: string;
          p_kind: string;
          p_order_id: string;
          p_sha256: string;
          p_size_bytes: number;
          p_storage_path: string;
          p_text_sha256: string;
          p_text_version: string;
        };
        Returns: string;
      };
      signup_complete: { Args: { p_code_at: string; p_user_id: string }; Returns: string };
      signup_find_account: {
        Args: { p_email: string; p_phone: string };
        Returns: {
          matched_by: string;
          phone_confirmed: boolean;
          self_signup: boolean;
          signup_completed: boolean;
          started_at: string;
          user_id: string;
        }[];
      };
      signup_prepare: {
        Args: {
          p_consents: Json;
          p_contact_preference: string;
          p_email: string;
          p_full_name: string;
          p_ip_hash: string;
          p_phone: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      signup_register_attempt: {
        Args: { p_email_hash: string; p_ip_hash: string; p_phone_hash: string };
        Returns: string;
      };
      staff_boundary_pointers: {
        Args: { p_parcel_id: string };
        Returns: {
          id: string;
          name: string;
          recorded_at: string;
          role: string;
          session_id: string;
        }[];
      };
      visit_approver: { Args: { p_session_id: string }; Returns: Json };
      waive_coverage: {
        Args: { p_note: string; p_session_id: string };
        Returns: {
          active_trees: number;
          blind_spot_cells: NonNullable<Json>;
          blind_spots: number;
          covered_trees: number;
          created_at: string;
          created_by: string | null;
          id: string;
          missing_slot_codes: string[];
          missing_trees: number | null;
          org_id: string;
          params_hash: string;
          parcel_id: string;
          passed: boolean | null;
          pipeline: string;
          pipeline_version: string;
          ratio: number | null;
          rescan_needed: boolean | null;
          rule: NonNullable<Json>;
          session_id: string;
          threshold: number;
          waived_at: string | null;
          waived_by: string | null;
          waiver_note: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "coverage_report";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      age_class: "sapling" | "young" | "productive" | "old" | "unknown";
      application_rejection_reason:
        | "out_of_service_area"
        | "area_mismatch"
        | "not_authorized"
        | "duplicate"
        | "capacity"
        | "other";
      application_status: "draft" | "submitted" | "quoted" | "accepted" | "rejected" | "withdrawn";
      assessment_source: "ai" | "model" | "expert";
      asset_kind:
        | "panorama"
        | "tree_crop"
        | "trajectory"
        | "point_cloud"
        | "tree_point_cloud"
        | "photo"
        | "other";
      billing_party_kind: "individual" | "company";
      boundary_source: "owner_declared" | "field_survey";
      capture_kind: "video_360" | "mcap" | "gnss_raw" | "photo" | "audio_note" | "other";
      card_visibility: "shown" | "hidden" | "under_evaluation";
      consent_kind:
        | "kvkk_notice"
        | "explicit_service_improvement"
        | "explicit_marketing"
        | "distance_sales"
        | "pre_information"
        | "early_performance";
      consent_source: "signup" | "portal" | "quote_acceptance" | "ops";
      corner: "ne" | "nw" | "se" | "sw";
      device_kind: "human_kit" | "robot" | "phone" | "base_station" | "other";
      finding_severity: "info" | "low" | "medium" | "high";
      followup_kind: "closeup" | "verification" | "extra_visit";
      followup_origin: "expert" | "pipeline";
      followup_status: "open" | "planned" | "done" | "cancelled";
      garden_removal_reason:
        "sold" | "not_needed" | "dissatisfied" | "cost" | "transfer" | "duplicate" | "other";
      garden_removal_status: "requested" | "scheduled" | "completed" | "cancelled";
      graft_status: "grafted" | "ungrafted" | "unknown";
      health_class: "healthy" | "attention" | "problem" | "dead" | "absent";
      irrigation_type: "irrigated" | "rainfed" | "unknown";
      measurement_source: "staff" | "algorithm" | "ai" | "expert";
      measurement_subject: "tree" | "slot" | "zone" | "parcel";
      metric_value_type: "numeric" | "scale" | "category" | "boolean";
      notification_channel: "sms" | "whatsapp";
      notification_status: "pending" | "sent" | "failed";
      notification_template:
        | "report_ready"
        | "critical_finding"
        | "quote_ready"
        | "application_rejected"
        | "payment_received"
        | "refund_completed"
        | "payment_reminder"
        | "garden_removal_scheduled"
        | "garden_removal_rescheduled"
        | "garden_removal_cancelled"
        | "garden_removal_completed"
        | "garden_access_ending"
        | "contract_ready"
        | "withdrawal_received"
        | "addon_order_closed"
        | "viewer_invited";
      operation_kind:
        | "mowing"
        | "spraying"
        | "tillage"
        | "pruning"
        | "fertilizing"
        | "irrigation"
        | "harvest"
        | "other";
      order_status: "awaiting_payment" | "active" | "completed" | "cancelled" | "terminated";
      org_kind: "company" | "cooperative" | "insurer" | "service_provider" | "other";
      org_role: "field_staff" | "expert" | "ops";
      parcel_role: "owner" | "viewer";
      parcel_status:
        "registered" | "inventory_planned" | "inventory_done" | "active_monitoring" | "passive";
      payment_provider: "iyzico" | "manual" | "fake";
      payment_status:
        "initiated" | "pending_review" | "succeeded" | "failed" | "expired" | "voided";
      performer_kind: "crew" | "robot";
      price_list_status: "draft" | "published";
      question_author_role: "owner" | "viewer" | "expert" | "ops";
      quote_status: "issued" | "accepted" | "declined" | "superseded" | "expired" | "cancelled";
      refund_kind: "void" | "refund" | "manual";
      refund_reason:
        | "withdrawal"
        | "missed_visit"
        | "termination"
        | "overpayment"
        | "order_closed"
        | "provider_mismatch"
        | "goodwill"
        | "other";
      refund_status: "requested" | "processing" | "succeeded" | "failed" | "cancelled";
      season: "winter" | "spring" | "summer" | "harvest";
      sensor_kind: "camera_360" | "lidar" | "gnss" | "thermal" | "phone_camera" | "imu" | "other";
      session_kind:
        | "inventory"
        | "periodic_scan"
        | "verification"
        | "mowing"
        | "spraying"
        | "tillage"
        | "manual_entry";
      session_status:
        "planned" | "captured" | "processed" | "in_review" | "published" | "cancelled";
      slot_kind: "row" | "interstitial";
      stem_form: "single" | "multi" | "unknown";
      tree_sex: "female" | "male" | "unknown";
      tree_status: "active" | "lost";
      verification_reason:
        | "high_uncertainty"
        | "empty_slot"
        | "unsure"
        | "multi_stem"
        | "possible_sapling"
        | "off_row"
        | "triangulation"
        | "other";
      verification_status: "open" | "checked" | "closed";
      zone_kind:
        | "cell"
        | "no_go"
        | "entry_point"
        | "irrigation_line"
        | "well"
        | "pool"
        | "fence"
        | "gate"
        | "shed"
        | "other";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      age_class: ["sapling", "young", "productive", "old", "unknown"],
      application_rejection_reason: [
        "out_of_service_area",
        "area_mismatch",
        "not_authorized",
        "duplicate",
        "capacity",
        "other",
      ],
      application_status: ["draft", "submitted", "quoted", "accepted", "rejected", "withdrawn"],
      assessment_source: ["ai", "model", "expert"],
      asset_kind: [
        "panorama",
        "tree_crop",
        "trajectory",
        "point_cloud",
        "tree_point_cloud",
        "photo",
        "other",
      ],
      billing_party_kind: ["individual", "company"],
      boundary_source: ["owner_declared", "field_survey"],
      capture_kind: ["video_360", "mcap", "gnss_raw", "photo", "audio_note", "other"],
      card_visibility: ["shown", "hidden", "under_evaluation"],
      consent_kind: [
        "kvkk_notice",
        "explicit_service_improvement",
        "explicit_marketing",
        "distance_sales",
        "pre_information",
        "early_performance",
      ],
      consent_source: ["signup", "portal", "quote_acceptance", "ops"],
      corner: ["ne", "nw", "se", "sw"],
      device_kind: ["human_kit", "robot", "phone", "base_station", "other"],
      finding_severity: ["info", "low", "medium", "high"],
      followup_kind: ["closeup", "verification", "extra_visit"],
      followup_origin: ["expert", "pipeline"],
      followup_status: ["open", "planned", "done", "cancelled"],
      garden_removal_reason: [
        "sold",
        "not_needed",
        "dissatisfied",
        "cost",
        "transfer",
        "duplicate",
        "other",
      ],
      garden_removal_status: ["requested", "scheduled", "completed", "cancelled"],
      graft_status: ["grafted", "ungrafted", "unknown"],
      health_class: ["healthy", "attention", "problem", "dead", "absent"],
      irrigation_type: ["irrigated", "rainfed", "unknown"],
      measurement_source: ["staff", "algorithm", "ai", "expert"],
      measurement_subject: ["tree", "slot", "zone", "parcel"],
      metric_value_type: ["numeric", "scale", "category", "boolean"],
      notification_channel: ["sms", "whatsapp"],
      notification_status: ["pending", "sent", "failed"],
      notification_template: [
        "report_ready",
        "critical_finding",
        "quote_ready",
        "application_rejected",
        "payment_received",
        "refund_completed",
        "payment_reminder",
        "garden_removal_scheduled",
        "garden_removal_rescheduled",
        "garden_removal_cancelled",
        "garden_removal_completed",
        "garden_access_ending",
        "contract_ready",
        "withdrawal_received",
        "addon_order_closed",
        "viewer_invited",
      ],
      operation_kind: [
        "mowing",
        "spraying",
        "tillage",
        "pruning",
        "fertilizing",
        "irrigation",
        "harvest",
        "other",
      ],
      order_status: ["awaiting_payment", "active", "completed", "cancelled", "terminated"],
      org_kind: ["company", "cooperative", "insurer", "service_provider", "other"],
      org_role: ["field_staff", "expert", "ops"],
      parcel_role: ["owner", "viewer"],
      parcel_status: [
        "registered",
        "inventory_planned",
        "inventory_done",
        "active_monitoring",
        "passive",
      ],
      payment_provider: ["iyzico", "manual", "fake"],
      payment_status: ["initiated", "pending_review", "succeeded", "failed", "expired", "voided"],
      performer_kind: ["crew", "robot"],
      price_list_status: ["draft", "published"],
      question_author_role: ["owner", "viewer", "expert", "ops"],
      quote_status: ["issued", "accepted", "declined", "superseded", "expired", "cancelled"],
      refund_kind: ["void", "refund", "manual"],
      refund_reason: [
        "withdrawal",
        "missed_visit",
        "termination",
        "overpayment",
        "order_closed",
        "provider_mismatch",
        "goodwill",
        "other",
      ],
      refund_status: ["requested", "processing", "succeeded", "failed", "cancelled"],
      season: ["winter", "spring", "summer", "harvest"],
      sensor_kind: ["camera_360", "lidar", "gnss", "thermal", "phone_camera", "imu", "other"],
      session_kind: [
        "inventory",
        "periodic_scan",
        "verification",
        "mowing",
        "spraying",
        "tillage",
        "manual_entry",
      ],
      session_status: ["planned", "captured", "processed", "in_review", "published", "cancelled"],
      slot_kind: ["row", "interstitial"],
      stem_form: ["single", "multi", "unknown"],
      tree_sex: ["female", "male", "unknown"],
      tree_status: ["active", "lost"],
      verification_reason: [
        "high_uncertainty",
        "empty_slot",
        "unsure",
        "multi_stem",
        "possible_sapling",
        "off_row",
        "triangulation",
        "other",
      ],
      verification_status: ["open", "checked", "closed"],
      zone_kind: [
        "cell",
        "no_go",
        "entry_point",
        "irrigation_line",
        "well",
        "pool",
        "fence",
        "gate",
        "shed",
        "other",
      ],
    },
  },
} as const;
