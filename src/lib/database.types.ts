export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      elections: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { name?: string };
        Relationships: [];
      };
      candidates: {
        Row: { id: string; election_id: string; candidate_number: number; candidate_name: string; created_at: string };
        Insert: { id?: string; election_id: string; candidate_number: number; candidate_name: string; created_at?: string };
        Update: { candidate_name?: string };
        Relationships: [];
      };
      tps: {
        Row: { id: string; election_id: string; tps_number: number; name: string; created_at: string };
        Insert: { id?: string; election_id: string; tps_number: number; name: string; created_at?: string };
        Update: { name?: string };
        Relationships: [];
      };
      profiles: {
        Row: { user_id: string; tps_id: string | null; role: string; created_at: string };
        Insert: { user_id: string; tps_id?: string | null; role?: string; created_at?: string };
        Update: { tps_id?: string | null; role?: string };
        Relationships: [];
      };
      vote_events: {
        Row: { id: string; election_id: string; tps_id: string; candidate_id: string | null; user_id: string; delta: number; vote_kind: "candidate" | "golput"; created_at: string; client_created_at: string | null };
        Insert: { id: string; election_id: string; tps_id: string; candidate_id?: string | null; user_id: string; delta: number; vote_kind?: "candidate" | "golput"; created_at?: string; client_created_at?: string | null };
        Update: never;
        Relationships: [];
      };
      vote_totals: {
        Row: { election_id: string; tps_id: string; candidate_id: string; total: number; updated_at: string };
        Insert: { election_id: string; tps_id: string; candidate_id: string; total?: number; updated_at?: string };
        Update: never;
        Relationships: [];
      };
      golput_totals: {
        Row: { election_id: string; tps_id: string; total: number; updated_at: string };
        Insert: { election_id: string; tps_id: string; total?: number; updated_at?: string };
        Update: never;
        Relationships: [];
      };
      operator_status: {
        Row: { user_id: string; tps_id: string; is_online: boolean; current_page: string; last_seen_at: string };
        Insert: { user_id: string; tps_id: string; is_online?: boolean; current_page?: string; last_seen_at?: string };
        Update: { is_online?: boolean; current_page?: string; last_seen_at?: string };
        Relationships: [];
      };
      operator_sessions: {
        Row: { user_id: string; tps_id: string; device_id: string; last_seen_at: string; lease_expires_at: string; created_at: string };
        Insert: { user_id: string; tps_id: string; device_id: string; last_seen_at?: string; lease_expires_at?: string; created_at?: string };
        Update: { device_id?: string; last_seen_at?: string; lease_expires_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_vote_event: {
        Args: { p_event_id: string; p_candidate_id: string; p_delta: number; p_client_created_at: string | null };
        Returns: { event_status: string; new_total: number }[];
      };
      submit_golput_event: {
        Args: { p_event_id: string; p_delta: number; p_client_created_at: string | null };
        Returns: { event_status: string; new_total: number }[];
      };
      report_operator_status: {
        Args: { p_is_online: boolean; p_current_page?: string };
        Returns: undefined;
      };
      claim_operator_session: {
        Args: { p_device_id: string };
        Returns: { session_status: string; lease_expires_at: string }[];
      };
      heartbeat_operator_session: {
        Args: { p_device_id: string };
        Returns: { session_status: string; lease_expires_at: string | null }[];
      };
      release_operator_session: {
        Args: { p_device_id: string };
        Returns: boolean;
      };
      admin_release_operator_session: {
        Args: { p_tps_id: string };
        Returns: boolean;
      };
      submit_vote_event_device: {
        Args: { p_device_id: string; p_event_id: string; p_candidate_id: string; p_delta: number; p_client_created_at: string | null };
        Returns: { event_status: string; new_total: number }[];
      };
      submit_golput_event_device: {
        Args: { p_device_id: string; p_event_id: string; p_delta: number; p_client_created_at: string | null };
        Returns: { event_status: string; new_total: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
export type Tps = Database["public"]["Tables"]["tps"]["Row"];
export type VoteTotal = Database["public"]["Tables"]["vote_totals"]["Row"];
export type GolputTotal = Database["public"]["Tables"]["golput_totals"]["Row"];
export type OperatorStatus = Database["public"]["Tables"]["operator_status"]["Row"];
export type OperatorSession = Database["public"]["Tables"]["operator_sessions"]["Row"];
