import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

const transcriptionId = "11111111-1111-4111-8111-111111111111";
const extractionId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";

function modelCandidate(overrides = {}) {
  return {
    semantic_layer: "brain",
    item_type: "principle",
    priority: 100,
    title: "Fix the constraint first",
    content: "Before scaling acquisition, identify and fix the real bottleneck.",
    summary: "Fix the bottleneck before scaling.",
    topics: ["growth", "CAC"],
    source_excerpt: "fix the real bottleneck before scaling",
    ...overrides,
  };
}

test("voice teaching parser requires exact transcript evidence and preserves model topic boundaries", async () => {
  const {
    parseVoiceTeachingCandidates,
    validateVoiceTeachingExtractionInput,
    isVoiceTeachingUuid,
  } = await importSource("src/features/voice-teaching/core.ts");
  const transcript = "First, fix the real bottleneck before scaling. Then review CAC.";

  assert.equal(isVoiceTeachingUuid(transcriptionId), true);
  assert.equal(isVoiceTeachingUuid("bad"), false);
  assert.deepEqual(validateVoiceTeachingExtractionInput({ transcriptionId }), { transcriptionId });
  assert.equal(validateVoiceTeachingExtractionInput({ transcriptionId: "bad" }), null);

  const valid = parseVoiceTeachingCandidates(
    JSON.stringify({
      candidates: [modelCandidate({ topics: ["growth, premium", "CAC", "cac"] })],
    }),
    transcript,
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.candidates[0].semantic_layer, "brain");
  assert.deepEqual(valid.candidates[0].topics, ["growth, premium", "CAC"]);

  const inventedExcerpt = parseVoiceTeachingCandidates(
    JSON.stringify({ candidates: [modelCandidate({ source_excerpt: "not in transcript" })] }),
    transcript,
  );
  assert.equal(inventedExcerpt.ok, false);

  const duplicate = parseVoiceTeachingCandidates(
    JSON.stringify({ candidates: [modelCandidate(), modelCandidate({ title: "Duplicate" })] }),
    transcript,
  );
  assert.equal(duplicate.ok, false);

  const invalidEnum = parseVoiceTeachingCandidates(
    JSON.stringify({ candidates: [modelCandidate({ semantic_layer: "memory" })] }),
    transcript,
  );
  assert.equal(invalidEnum.ok, false);
});

test("voice teaching request builder produces the strict bounded Responses contract", async () => {
  const {
    buildVoiceTeachingResponseRequest,
    VOICE_TEACHING_LEASE_SECONDS,
    VOICE_TEACHING_MAX_OUTPUT_TOKENS,
  } = await importSource("src/features/voice-teaching/core.ts");

  const request = buildVoiceTeachingResponseRequest(
    "gpt-5-mini",
    "Transcript source text only.",
  );

  assert.equal(request.model, "gpt-5-mini");
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, VOICE_TEACHING_MAX_OUTPUT_TOKENS);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.additionalProperties, false);
  assert.equal(request.text.format.schema.properties.candidates.maxItems, 12);
  assert.match(request.input[0].content[0].text, /<transcript>\nTranscript source text only\.\n<\/transcript>/);
  assert.equal(VOICE_TEACHING_LEASE_SECONDS, 150);
});

test("voice teaching draft selection accepts editable form strings and normalizes through Teach Eslam rules", async () => {
  const { validateVoiceTeachingDraftSelections } = await importSource(
    "src/features/voice-teaching/core.ts",
  );

  const result = validateVoiceTeachingDraftSelections({
    extractionId,
    candidates: [
      {
        candidate_id: candidateId,
        semantic_layer: "brain",
        item_type: "diagnostic_rule",
        priority: "75",
        title: "  Diagnose before optimizing  ",
        content: "  Find the bottleneck first.  ",
        summary: "",
        topics: "CAC, funnel\nacquisition",
        change_note: "Edited after voice extraction",
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidates[0].priority, 75);
  assert.deepEqual(result.candidates[0].topics, ["CAC", "funnel", "acquisition"]);
  assert.equal(result.candidates[0].title, "Diagnose before optimizing");
  assert.equal(result.candidates[0].change_note, "Edited after voice extraction");

  assert.equal(
    validateVoiceTeachingDraftSelections({
      extractionId,
      candidates: [
        {
          candidate_id: candidateId,
          semantic_layer: "brain",
          item_type: "principle",
          priority: "100",
          title: "A",
          content: "B",
          summary: "",
          topics: "one",
          change_note: "",
        },
        {
          candidate_id: candidateId,
          semantic_layer: "brain",
          item_type: "principle",
          priority: "100",
          title: "C",
          content: "D",
          summary: "",
          topics: "two",
          change_note: "",
        },
      ],
    }).ok,
    false,
  );
});

test("voice teaching server wiring stays owner-scoped, retry-safe, and cannot approve or publish", () => {
  const actions = readSource("src/features/voice-teaching/actions.ts");
  const openaiClient = readSource("src/lib/openai/client.ts");

  assert.match(actions, /^"use server";/);
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /claim_voice_teaching_extraction/);
  assert.match(actions, /complete_voice_teaching_extraction/);
  assert.match(actions, /fail_voice_teaching_extraction/);
  assert.match(actions, /create_voice_teaching_drafts/);
  assert.match(actions, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(actions, /getOpenAIVoiceTeachingClient\(\)\.responses\.create/);
  assert.match(actions, /response\.status === "incomplete"/);
  assert.match(actions, /openai-truncated/);
  assert.doesNotMatch(actions, /review_eslam_brain_item|publish_eslam_brain_draft_direct/);
  assert.match(openaiClient, /^import "server-only";/);
  assert.match(openaiClient, /OPENAI_VOICE_TEACHING_TIMEOUT_MS = 120_000/);
  assert.match(openaiClient, /OPENAI_VOICE_TEACHING_MAX_RETRIES = 0/);
  assert.match(openaiClient, /OPENAI_VOICE_TEACHING_MODEL/);
});

test("voice teaching page paginates saved sources and only reviews completed transcripts on the visible page", () => {
  const page = readSource("src/app/admin/teach/voice/page.tsx");
  const transcriptionData = readSource("src/features/voice-transcription/data.ts");
  const transcriptionList = readSource("src/features/voice-transcription/transcription-list.tsx");
  const teachingData = readSource("src/features/voice-teaching/data.ts");
  const workbench = readSource("src/features/voice-teaching/workbench.tsx");

  assert.match(transcriptionData, /VOICE_TRANSCRIPTION_PAGE_SIZE = 20/);
  assert.match(transcriptionData, /\.range\(offset, offset \+ VOICE_TRANSCRIPTION_PAGE_SIZE\)/);
  assert.match(page, /requestedPage/);
  assert.match(page, /transcriptionPage\.items/);
  assert.match(transcriptionList, /hasPrevious/);
  assert.match(transcriptionList, /hasNext/);
  assert.match(teachingData, /\.eq\("created_by", userId\)/);
  assert.match(teachingData, /voice_teaching_candidate_drafts/);
  assert.match(workbench, /type="checkbox"/);
  assert.match(workbench, /createVoiceTeachingDraftsAction/);
  assert.doesNotMatch(workbench, /publish_eslam_brain_draft_direct|review_eslam_brain_item/);
});

test("voice teaching migrations preserve service-only audit lineage and release deployments stay enabled", () => {
  const baseMigration = readSource(
    "supabase/migrations/20260812195918_create_voice_teaching_workflow.sql",
  );
  const indexMigration = readSource(
    "supabase/migrations/20260812202159_index_voice_teaching_foreign_keys.sql",
  );
  const hardeningMigration = readSource(
    "supabase/migrations/20260812203202_harden_voice_teaching_audit_indexes.sql",
  );
  const ci = readSource(".github/workflows/ci.yml");
  const vercelUrl = new URL("../vercel.json", import.meta.url);
  const env = readSource(".env.example");

  assert.match(baseMigration, /create table public\.voice_teaching_extractions/);
  assert.match(baseMigration, /create table public\.voice_teaching_candidates/);
  assert.match(baseMigration, /create table public\.voice_teaching_candidate_drafts/);
  assert.match(baseMigration, /alter table public\.voice_teaching_extractions enable row level security/);
  assert.match(baseMigration, /revoke all on function public\.claim_voice_teaching_extraction/);
  assert.match(baseMigration, /grant execute on function public\.create_voice_teaching_drafts[\s\S]*to service_role/);
  assert.match(baseMigration, /'draft'/);
  assert.doesNotMatch(baseMigration, /'published'/);
  assert.match(indexMigration, /voice_teaching_extractions_voice_recording_idx/);
  assert.match(hardeningMigration, /drop index if exists public\.voice_teaching_candidates_extraction_idx/);
  assert.match(hardeningMigration, /prevent_completed_voice_teaching_extraction_delete/);
  assert.match(ci, /voice_teaching_runtime\.sql/);
  assert.match(ci, /voice_teaching_audit_runtime\.sql/);
  if (existsSync(vercelUrl)) {
    const vercel = JSON.parse(readFileSync(vercelUrl, "utf8"));
    assert.notEqual(vercel.git?.deploymentEnabled, false);
  }
  assert.match(env, /# OPENAI_VOICE_TEACHING_MODEL=gpt-5-mini/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_OPENAI/);
});
