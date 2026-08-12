create index voice_teaching_extractions_voice_recording_idx
  on public.voice_teaching_extractions (voice_recording_id);

create index voice_teaching_candidates_owner_extraction_idx
  on public.voice_teaching_candidates (created_by, extraction_id, ordinal);

create index voice_teaching_candidate_drafts_owner_candidate_idx
  on public.voice_teaching_candidate_drafts (created_by, candidate_id);
