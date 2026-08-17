import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database as BaseDatabase, Json } from "@/types/database";

type BasePublic = BaseDatabase["public"];
type SimpleTable<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };

type InterviewSessionRow = {
  id: string;
  status: string;
  created_by: string;
  focus_topic: string | null;
  focus_topic_key: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
type InterviewSessionTable = SimpleTable<
  InterviewSessionRow,
  Partial<InterviewSessionRow> & Pick<InterviewSessionRow, "created_by">
>;
type InterviewQuestionRow = {
  id: string; session_id: string; created_by: string; ordinal: number; status: string;
  question: string; topic: string; topic_key: string; why_this_question: string; gap_type: string;
  grounding_sources: Json; relevant_known_facts: Json; follow_up_recommended: boolean;
  question_fingerprint: string; model: string; prompt_version: number; resolved_at: string | null; created_at: string;
};
type InterviewQuestionTable = SimpleTable<InterviewQuestionRow, Partial<InterviewQuestionRow> & Pick<InterviewQuestionRow, "session_id" | "created_by" | "ordinal" | "question" | "topic" | "topic_key" | "why_this_question" | "gap_type" | "grounding_sources" | "question_fingerprint" | "model">>;
type InterviewAnswerRow = {
  id: string; session_id: string; question_id: string; source_id: string; created_by: string; answer_text: string;
  extraction_status: string; extraction_attempt_count: number; extraction_claim_token: string | null;
  extraction_lease_expires_at: string | null; extraction_model: string | null; extraction_prompt_version: number | null;
  extraction_last_error_code: string | null; extraction_last_error_at: string | null; extraction_completed_at: string | null;
  created_at: string; updated_at: string;
};
type InterviewAnswerTable = SimpleTable<InterviewAnswerRow, Partial<InterviewAnswerRow> & Pick<InterviewAnswerRow, "session_id" | "question_id" | "source_id" | "created_by" | "answer_text">>;
type InterviewAnswerTeachingTable = SimpleTable<
  { answer_id: string; candidate_ordinal: number; brain_item_id: string; created_by: string; created_at: string },
  { answer_id: string; candidate_ordinal: number; brain_item_id: string; created_by: string; created_at?: string }
>;
type InterviewTopicSuppressionTable = SimpleTable<
  { id: string; created_by: string; session_id: string; topic_key: string; topic_label: string; created_at: string },
  { id?: string; created_by: string; session_id: string; topic_key: string; topic_label: string; created_at?: string }
>;

export type InterviewDatabase = Omit<BaseDatabase, "public"> & {
  public: Omit<BasePublic, "Tables" | "Functions"> & {
    Tables: BasePublic["Tables"] & {
      interview_sessions: InterviewSessionTable;
      interview_questions: InterviewQuestionTable;
      interview_answers: InterviewAnswerTable;
      interview_answer_teachings: InterviewAnswerTeachingTable;
      interview_topic_suppressions: InterviewTopicSuppressionTable;
    };
    Functions: BasePublic["Functions"] & {
      start_interview_session: { Args: { p_created_by: string }; Returns: string };
      record_interview_question: { Args: { p_session_id: string; p_created_by: string; p_payload: Json }; Returns: string };
      submit_interview_answer: { Args: { p_question_id: string; p_created_by: string; p_answer_text: string }; Returns: Array<{ answer_id: string; source_id: string; session_id: string }> };
      resolve_interview_question: { Args: { p_question_id: string; p_created_by: string; p_resolution: string; p_suppress_topic?: boolean }; Returns: string };
      claim_interview_answer_extraction: { Args: { p_answer_id: string; p_created_by: string; p_model: string; p_prompt_version?: number; p_lease_seconds?: number }; Returns: Array<{ answer_id: string | null; claim_state: string; claim_token: string | null; attempt_count: number }> };
      complete_interview_answer_extraction: { Args: { p_answer_id: string; p_created_by: string; p_claim_token: string; p_candidates: Json }; Returns: Array<{ candidate_ordinal: number; brain_item_id: string }> };
      fail_interview_answer_extraction: { Args: { p_answer_id: string; p_created_by: string; p_claim_token: string; p_error_code: string }; Returns: boolean };
      set_interview_session_focus: { Args: { p_session_id: string; p_created_by: string; p_focus_topic: string | null; p_focus_topic_key: string | null }; Returns: boolean };
      complete_interview_session: { Args: { p_session_id: string; p_created_by: string }; Returns: boolean };
      get_interview_intelligence_stats: { Args: { p_created_by: string }; Returns: Json };
    };
  };
};

/** Narrows the existing server-only Admin client to the current Interview Eslam database contract. */
export function getInterviewAdminClient() {
  return getSupabaseAdminClient() as unknown as SupabaseClient<InterviewDatabase>;
}
