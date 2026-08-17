"use server";

import { revalidatePath } from "next/cache";

import { finalizeKnowledgeUploadAction } from "@/features/knowledge-library/actions";
import { KNOWLEDGE_LIBRARY_BUCKET } from "@/features/knowledge-library/core";
import { getKnowledgeAdminClient } from "@/features/knowledge-library/database";
import {
  buildYouTubeTranscriptArtifact,
  classifyExistingYouTubeSource,
  type YouTubeExistingSourceStatus,
  type YouTubeImportRefreshResult,
  type YouTubeImportResult,
  validateYouTubeImportId,
  validateYouTubeSourceInput,
} from "@/features/youtube-sources/core";
import {
  fetchYouTubeProviderMetadata,
  pollYouTubeProviderTranscript,
  startYouTubeProviderTranscript,
  youtubeProviderErrorCode,
  type YouTubeProviderJobResult,
  type YouTubeProviderMetadata,
  type YouTubeProviderStartResult,
  type YouTubeProviderTranscript,
} from "@/features/youtube-sources/provider";
import { requireAdmin } from "@/lib/auth/admin";

const KNOWLEDGE_PATH = "/admin/knowledge";
const INTERVIEW_PATH = "/admin/teach/interview";

type ExistingYouTubeSource = {
  sourceId: string;
  status: YouTubeExistingSourceStatus;
};

function refreshYouTubeSourcePages() {
  revalidatePath(KNOWLEDGE_PATH);
  revalidatePath(INTERVIEW_PATH);
}

function providerFailure(error: unknown): YouTubeImportResult {
  const code = youtubeProviderErrorCode(error);
  if (code === "provider-not-configured") return { ok: false, error: "provider-not-configured" };
  if (code === "video-unavailable" || code === "transcript-unavailable") return { ok: false, error: "transcript-unavailable" };
  if (code === "transcript-too-large") return { ok: false, error: "transcript-too-large" };
  console.error("YouTube source provider request failed", { code });
  return { ok: false, error: "provider-failed" };
}

async function existingYouTubeSource(videoId: string): Promise<ExistingYouTubeSource | null> {
  const admin = getKnowledgeAdminClient();
  const { data, error } = await admin
    .from("knowledge_sources")
    .select("id,status")
    .eq("source_kind", "youtube_transcript")
    .eq("external_source_id", videoId)
    .neq("status", "deleting")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (!["pending", "indexing", "ready", "failed", "deleting"].includes(data.status)) {
    throw new Error("YouTube Knowledge source returned an invalid state");
  }
  return { sourceId: data.id, status: data.status as YouTubeExistingSourceStatus };
}

async function deleteStagingImport(importId: string) {
  const admin = getKnowledgeAdminClient();
  const { error } = await admin.from("youtube_transcript_imports").delete().eq("id", importId);
  if (error) {
    console.error("YouTube transcript staging cleanup failed", { importId, code: error.code });
  }
}

async function materializeYouTubeTranscript(input: {
  actorId: string;
  videoId: string;
  canonicalUrl: string;
  metadata: YouTubeProviderMetadata;
  transcript: YouTubeProviderTranscript;
}): Promise<YouTubeImportResult> {
  const existing = await existingYouTubeSource(input.videoId);
  if (existing) {
    const result = classifyExistingYouTubeSource(existing.sourceId, existing.status);
    return result.ok ? result : { ok: false, error: "index-failed" };
  }

  const artifact = buildYouTubeTranscriptArtifact({
    title: input.metadata.title,
    channelName: input.metadata.channelName,
    canonicalUrl: input.canonicalUrl,
    language: input.transcript.language,
    transcript: input.transcript.transcript,
  });
  if (!artifact) return { ok: false, error: "transcript-too-large" };

  const admin = getKnowledgeAdminClient();
  const sourceId = crypto.randomUUID();
  const safeLanguage = input.transcript.language?.replace(/[^A-Za-z0-9-]/gu, "-").slice(0, 35) || "unknown";
  const originalFilename = `youtube-${input.videoId}-${safeLanguage}.txt`;
  const storagePath = `${input.actorId}/${sourceId}.txt`;

  const { error: insertError } = await admin.from("knowledge_sources").insert({
    id: sourceId,
    created_by: input.actorId,
    storage_bucket: KNOWLEDGE_LIBRARY_BUCKET,
    storage_path: storagePath,
    status: "pending",
    title: artifact.title,
    original_filename: originalFilename,
    mime_type: "text/plain",
    declared_size_bytes: artifact.bytes.length,
    source_kind: "youtube_transcript",
    source_url: input.canonicalUrl,
    external_source_id: input.videoId,
    source_language: input.transcript.language,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      const raced = await existingYouTubeSource(input.videoId);
      if (raced) {
        const result = classifyExistingYouTubeSource(raced.sourceId, raced.status);
        return result.ok ? result : { ok: false, error: "index-failed" };
      }
    }
    console.error("YouTube Knowledge metadata persistence failed", { code: insertError.code });
    return { ok: false, error: "storage-failed" };
  }

  const transcriptBlob = new Blob([artifact.content], { type: "text/plain" });
  const { error: uploadError } = await admin.storage
    .from(KNOWLEDGE_LIBRARY_BUCKET)
    .upload(storagePath, transcriptBlob, { contentType: "text/plain", upsert: false });
  if (uploadError) {
    await admin.from("knowledge_sources").delete().eq("id", sourceId).eq("status", "pending");
    console.error("YouTube transcript Storage persistence failed", { sourceId, code: uploadError.message.slice(0, 100) });
    return { ok: false, error: "storage-failed" };
  }

  const finalized = await finalizeKnowledgeUploadAction({ sourceId });
  refreshYouTubeSourcePages();
  if (!finalized.ok) return { ok: false, error: "index-failed" };
  return { ok: true, state: finalized.status, sourceId };
}

async function saveProviderJob(input: {
  actorId: string;
  videoId: string;
  canonicalUrl: string;
  requestedLanguage: string | null;
  metadata: YouTubeProviderMetadata;
  jobId: string;
}) {
  const admin = getKnowledgeAdminClient();
  const { data, error } = await admin
    .from("youtube_transcript_imports")
    .insert({
      created_by: input.actorId,
      video_id: input.videoId,
      canonical_url: input.canonicalUrl,
      requested_language: input.requestedLanguage,
      resolved_language: null,
      video_title: input.metadata.title,
      channel_name: input.metadata.channelName,
      provider_job_id: input.jobId,
      status: "processing",
      last_error_code: null,
    })
    .select("id")
    .single();
  if (!error && data?.id) return data.id;

  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await admin
      .from("youtube_transcript_imports")
      .select("id,status")
      .eq("video_id", input.videoId)
      .maybeSingle();
    if (!existingError && existing?.id && existing.status === "processing") return existing.id;
  }
  console.error("YouTube transcript staging persistence failed", {
    videoId: input.videoId,
    code: error?.code ?? "unknown",
  });
  throw new Error(error?.message ?? "YouTube transcript job was not persisted");
}

/** Starts a bounded native-caption import and materializes synchronous transcripts into the normal Knowledge lifecycle. */
export async function importYouTubeSourceAction(input: unknown): Promise<YouTubeImportResult> {
  const authorization = await requireAdmin();
  const validated = validateYouTubeSourceInput(input);
  if (!validated) {
    const rawLanguage = input && typeof input === "object" && !Array.isArray(input)
      ? (input as { language?: unknown }).language
      : undefined;
    return typeof rawLanguage === "string" && rawLanguage.trim()
      ? { ok: false, error: "invalid-language" }
      : { ok: false, error: "invalid-url" };
  }

  const existing = await existingYouTubeSource(validated.videoId).catch((error: unknown) => {
    console.error("YouTube Knowledge duplicate lookup failed", {
      message: error instanceof Error ? error.message : "Unknown lookup error",
    });
    return null;
  });
  if (existing) return classifyExistingYouTubeSource(existing.sourceId, existing.status);

  const admin = getKnowledgeAdminClient();
  const { data: staged, error: stagedError } = await admin
    .from("youtube_transcript_imports")
    .select("id,status")
    .eq("video_id", validated.videoId)
    .maybeSingle();
  if (stagedError) {
    console.error("YouTube transcript staging lookup failed", { code: stagedError.code });
    return { ok: false, error: "provider-failed" };
  }
  if (staged?.status === "processing") return { ok: true, state: "processing", importId: staged.id };
  if (staged?.id) await deleteStagingImport(staged.id);

  let metadata: YouTubeProviderMetadata;
  let transcript: YouTubeProviderStartResult;
  try {
    metadata = await fetchYouTubeProviderMetadata(validated.videoId);
    transcript = await startYouTubeProviderTranscript(validated.canonicalUrl, validated.requestedLanguage);
  } catch (error) {
    return providerFailure(error);
  }

  if (transcript.state === "unavailable") return { ok: false, error: "transcript-unavailable" };
  if (transcript.state === "processing") {
    const importId = await saveProviderJob({
      actorId: authorization.userId,
      videoId: validated.videoId,
      canonicalUrl: validated.canonicalUrl,
      requestedLanguage: validated.requestedLanguage,
      metadata,
      jobId: transcript.jobId,
    });
    refreshYouTubeSourcePages();
    return { ok: true, state: "processing", importId };
  }

  return materializeYouTubeTranscript({
    actorId: authorization.userId,
    videoId: validated.videoId,
    canonicalUrl: validated.canonicalUrl,
    metadata,
    transcript: transcript.value,
  });
}

/** Polls a global Admin-visible async provider job and preserves the original import actor as durable provenance. */
export async function refreshYouTubeTranscriptImportAction(input: unknown): Promise<YouTubeImportRefreshResult> {
  await requireAdmin();
  const importId = validateYouTubeImportId(input);
  if (!importId) return { ok: false, error: "invalid-request" };
  const admin = getKnowledgeAdminClient();
  const { data: staged, error } = await admin
    .from("youtube_transcript_imports")
    .select("id,created_by,video_id,canonical_url,video_title,channel_name,provider_job_id,status")
    .eq("id", importId)
    .maybeSingle();
  if (error || !staged) return { ok: false, error: "not-found" };
  if (staged.status === "failed") return { ok: false, error: "provider-failed" };

  let result: YouTubeProviderJobResult;
  try {
    result = await pollYouTubeProviderTranscript(staged.provider_job_id);
  } catch (providerError) {
    const code = youtubeProviderErrorCode(providerError);
    if (code === "provider-not-configured") return { ok: false, error: "provider-not-configured" };
    if (code === "transcript-too-large") return { ok: false, error: "transcript-too-large" };
    console.error("YouTube transcript job refresh failed", { importId, code });
    return { ok: false, error: "provider-failed" };
  }

  if (result.state === "processing") return { ok: true, state: "processing", importId };
  if (result.state === "unavailable" || result.state === "failed") {
    const code = result.state === "unavailable" ? "transcript-unavailable" : "provider-job-failed";
    const { error: updateError } = await admin.from("youtube_transcript_imports").update({
      status: "failed",
      last_error_code: code,
      updated_at: new Date().toISOString(),
    }).eq("id", importId).eq("status", "processing");
    if (updateError) {
      console.error("YouTube transcript failed-state persistence failed", {
        importId,
        code: updateError.code,
      });
      throw new Error("YouTube transcript failed state could not be persisted");
    }
    refreshYouTubeSourcePages();
    return { ok: false, error: result.state === "unavailable" ? "transcript-unavailable" : "provider-failed" };
  }

  const materialized = await materializeYouTubeTranscript({
    actorId: staged.created_by,
    videoId: staged.video_id,
    canonicalUrl: staged.canonical_url,
    metadata: { title: staged.video_title, channelName: staged.channel_name },
    transcript: result.value,
  });
  if (materialized.ok) {
    await deleteStagingImport(importId);
    return materialized;
  }
  return materialized.error === "transcript-too-large"
    ? { ok: false, error: "transcript-too-large" }
    : materialized.error === "storage-failed"
      ? { ok: false, error: "storage-failed" }
      : { ok: false, error: "index-failed" };
}
