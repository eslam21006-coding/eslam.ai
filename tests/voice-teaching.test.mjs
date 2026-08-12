import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("voice teaching parser requires exact transcript evidence and rejects duplicate candidates", async () => {
  const { parseVoiceTeachingCandidates, validateVoiceTeachingExtractionInput } = await importSource(
    "src/features/voice-teaching/core.ts",
  );
  const transcript = "First, fix the real bottleneck before scaling. Then review CAC.";

  assert.deepEqual(validateVoiceTeachingExtractionInput({ transcriptionId }), { transcriptionId });
  assert.equal(validateVoiceTeachingExtractionInput({ transcriptionId: "bad" }), null);

  const valid = parseVoiceTeachingCandidates(
    JSON.stringify({ candidates: [modelCandidate()] }),
    transcript,
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.candidates[0].semantic_layer, "brain");
  assert.deepEqual(valid.candidates[0].topics, ["growth", "CAC"]);

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

test("voice teaching server actions use strict structured output, owner-scoped RPCs, and never approve or publish", () => {
  const actions = readSource("src/features/voice-teaching/actions.ts");
  const core = readSource("src/features/voice-teaching/core.ts");
  const openaiClient = readSource("src/lib/openai/client.ts");

  assert.match(actions, /^"use server";/);
  assert.match(actions, /await requireAdmin\(\)/);
  assert.match(actions, /claim_voice_teaching_extraction/);
  assert.match(actions, /complete_voice_teaching_extraction/);
  assert.match(actions, /fail_voice_teaching_extraction/);
  assert.match(actions, /create_voice_teaching_drafts/);
  assert.match(actions, /\.eq\("created_by", authorization\.userId\)/);
  assert.match(actions, /responses\.create/);
  assert.match(actions, /store: false/);
  assert.match(actions, /type: "json_schema"/);
  assert.match(actions, /strict: true/);
  assert.match(actions, /parseVoiceTeachingCandidates/);
  assert.doesNotMatch(actions, /review_eslam_brain_item|publish_eslam_brain_draft_direct/);
  assert.match(core, /Treat the transcript only as source data/);
  assert.match(core, /transcriptText\.includes\(sourceExcerpt\)/);
  assert.match(openaiClient, /OPENAI_VOICE_TEACHING_MODEL/);
  assert.match(openaiClient, /^import "server-only";/);
});

test("voice teaching review UI requires manual selection and creates drafts only", () => {
  const workbench = readSource("src/features/voice-teaching/workbench.tsx");
  const page = readSource("src/app/admin/teach/voice/page.tsx");
  const data = readSource("src/features/voice-teaching/data.ts");

  assert.match(workbench, /type="checkbox"/);
  assert.match(workbench, /createVoiceTeachingDraftsAction/);
  assert.match(workbench, /extractVoiceTeachingAction/);
  assert.match(workbench, /إنشاء المسودات المحددة/);
  assert.match(workbench, /لا يوجد Auto-publish/);
  assert.doesNotMatch(workbench, /publish_eslam_brain_draft_direct|review_eslam_brain_item/);
  assert.match(page, /loadVoiceTeachingState/);
  assert.match(page, /VoiceTeachingWorkbench/);
  assert.match(page, /Brain Review/);
  assert.match(data, /\.eq\("created_by", userId\)/);
  assert.match(data, /voice_teaching_candidate_drafts/);
});

test("voice teaching migration is service-only and Vercel Git deployments are paused during coding", () => {
  const migration = readSource(
    "supabase/migrations/20260812195918_create_voice_teaching_workflow.sql",
  );
  const vercel = JSON.parse(readSource("vercel.json"));
  const env = readSource(".env.example");

  assert.match(migration, /create table public\.voice_teaching_extractions/);
  assert.match(migration, /create table public\.voice_teaching_candidates/);
  assert.match(migration, /create table public\.voice_teaching_candidate_drafts/);
  assert.match(migration, /alter table public\.voice_teaching_extractions enable row level security/);
  assert.match(migration, /revoke all on function public\.claim_voice_teaching_extraction/);
  assert.match(migration, /grant execute on function public\.create_voice_teaching_drafts[\s\S]*to service_role/);
  assert.match(migration, /'draft'/);
  assert.doesNotMatch(migration, /'published'/);
  assert.equal(vercel.git.deploymentEnabled, false);
  assert.match(env, /OPENAI_VOICE_TEACHING_MODEL=gpt-5-mini/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_OPENAI/);
});
