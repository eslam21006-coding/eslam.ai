import "server-only";

import { YOUTUBE_TRANSCRIPT_MAX_CHARS } from "@/features/youtube-sources/core";

const SUPADATA_BASE_URL = "https://api.supadata.ai/v1";
const SUPADATA_TIMEOUT_MS = 20_000;
const PROVIDER_ID_MAX = 200;
const PROVIDER_MAX_SEGMENTS = 20_000;

export type YouTubeProviderMetadata = {
  title: string;
  channelName: string | null;
};

export type YouTubeProviderTranscript = {
  transcript: string;
  language: string | null;
};

export type YouTubeProviderStartResult =
  | { state: "ready"; value: YouTubeProviderTranscript }
  | { state: "processing"; jobId: string }
  | { state: "unavailable" };

export type YouTubeProviderJobResult =
  | { state: "ready"; value: YouTubeProviderTranscript }
  | { state: "processing" }
  | { state: "unavailable" }
  | { state: "failed" };

export class YouTubeTranscriptProviderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "YouTubeTranscriptProviderError";
    this.code = code;
  }
}

function providerKey() {
  const key = process.env.SUPADATA_API_KEY?.trim();
  if (!key) throw new YouTubeTranscriptProviderError("provider-not-configured", "YouTube transcript provider is not configured");
  return key;
}

function safeProviderErrorCode(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as { error?: unknown }).error;
  if (typeof candidate === "string") return candidate.slice(0, 100);
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const nested = (candidate as { error?: unknown }).error;
    return typeof nested === "string" ? nested.slice(0, 100) : null;
  }
  return null;
}

async function request(path: string) {
  const response = await fetch(`${SUPADATA_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": providerKey(),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(SUPADATA_TIMEOUT_MS),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 206 || response.status === 404) {
    return { payload, unavailable: true as const };
  }
  if (!response.ok) {
    const code = safeProviderErrorCode(payload) ?? `provider-http-${response.status}`;
    throw new YouTubeTranscriptProviderError(code, `Transcript provider request failed with HTTP ${response.status}`);
  }
  return { payload, unavailable: false as const };
}

function normalizeTranscript(payload: unknown): YouTubeProviderTranscript | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const raw = payload as { content?: unknown; lang?: unknown };
  let transcript = "";
  if (typeof raw.content === "string") {
    transcript = raw.content.trim();
    if (transcript.length > YOUTUBE_TRANSCRIPT_MAX_CHARS) {
      throw new YouTubeTranscriptProviderError("transcript-too-large", "Transcript exceeds the local safety limit");
    }
  } else if (Array.isArray(raw.content)) {
    if (raw.content.length > PROVIDER_MAX_SEGMENTS) {
      throw new YouTubeTranscriptProviderError("transcript-too-large", "Transcript contains too many segments");
    }
    const parts: string[] = [];
    let usedChars = 0;
    for (const item of raw.content) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const text = (item as { text?: unknown }).text;
      if (typeof text !== "string") continue;
      const normalized = text.trim();
      if (!normalized) continue;
      const separatorChars = parts.length ? 1 : 0;
      const remaining = YOUTUBE_TRANSCRIPT_MAX_CHARS - usedChars - separatorChars;
      if (remaining <= 0 || normalized.length > remaining) {
        throw new YouTubeTranscriptProviderError("transcript-too-large", "Transcript exceeds the local safety limit");
      }
      parts.push(normalized);
      usedChars += normalized.length + separatorChars;
    }
    transcript = parts.join("\n").trim();
  }
  if (!transcript) return null;
  const language = typeof raw.lang === "string" && raw.lang.trim().length >= 2 && raw.lang.trim().length <= 35
    ? raw.lang.trim()
    : null;
  return { transcript, language };
}

/** Retrieves bounded YouTube metadata from the configured provider and verifies video identity. */
export async function fetchYouTubeProviderMetadata(videoId: string): Promise<YouTubeProviderMetadata> {
  const { payload, unavailable } = await request(`/youtube/video?id=${encodeURIComponent(videoId)}`);
  if (unavailable || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new YouTubeTranscriptProviderError("video-unavailable", "YouTube video metadata is unavailable");
  }
  const raw = payload as { id?: unknown; title?: unknown; channel?: unknown };
  if (raw.id !== videoId || typeof raw.title !== "string" || !raw.title.trim()) {
    throw new YouTubeTranscriptProviderError("invalid-provider-metadata", "YouTube provider returned invalid metadata");
  }
  const channel = raw.channel && typeof raw.channel === "object" && !Array.isArray(raw.channel)
    ? (raw.channel as { name?: unknown }).name
    : null;
  return {
    title: raw.title.trim().slice(0, 200),
    channelName: typeof channel === "string" && channel.trim() ? channel.trim().slice(0, 200) : null,
  };
}

/** Starts native-caption retrieval only; it never silently falls back to paid AI transcription. */
export async function startYouTubeProviderTranscript(
  canonicalUrl: string,
  requestedLanguage: string | null,
): Promise<YouTubeProviderStartResult> {
  const params = new URLSearchParams({ url: canonicalUrl, text: "true", mode: "native" });
  if (requestedLanguage) params.set("lang", requestedLanguage);
  const { payload, unavailable } = await request(`/transcript?${params.toString()}`);
  if (unavailable) return { state: "unavailable" };

  const transcript = normalizeTranscript(payload);
  if (transcript) return { state: "ready", value: transcript };
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const jobId = (payload as { jobId?: unknown }).jobId;
    if (typeof jobId === "string" && jobId.trim() && jobId.trim().length <= PROVIDER_ID_MAX) {
      return { state: "processing", jobId: jobId.trim() };
    }
  }
  throw new YouTubeTranscriptProviderError("invalid-transcript-response", "Transcript provider returned an invalid response");
}

/** Polls one persisted provider job without exposing raw provider errors to product UI. */
export async function pollYouTubeProviderTranscript(jobId: string): Promise<YouTubeProviderJobResult> {
  if (!jobId.trim() || jobId.trim().length > PROVIDER_ID_MAX) return { state: "failed" };
  const { payload, unavailable } = await request(`/transcript/${encodeURIComponent(jobId.trim())}`);
  if (unavailable) return { state: "unavailable" };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { state: "failed" };
  const status = (payload as { status?: unknown }).status;
  if (status === "queued" || status === "active") return { state: "processing" };
  if (status === "failed") return { state: "failed" };
  if (status !== "completed") return { state: "failed" };
  const transcript = normalizeTranscript(payload);
  return transcript ? { state: "ready", value: transcript } : { state: "failed" };
}

/** Maps provider exceptions to a bounded internal retry classification. */
export function youtubeProviderErrorCode(error: unknown) {
  if (error instanceof YouTubeTranscriptProviderError) return error.code.slice(0, 100);
  if (error instanceof DOMException && error.name === "TimeoutError") return "provider-timeout";
  if (error instanceof Error && /timeout/iu.test(error.message)) return "provider-timeout";
  return "provider-failed";
}
