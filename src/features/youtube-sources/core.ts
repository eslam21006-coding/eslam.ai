export const YOUTUBE_TRANSCRIPT_MAX_CHARS = 4_000_000;
export const YOUTUBE_TRANSCRIPT_MAX_BYTES = 8 * 1024 * 1024;
export const YOUTUBE_SOURCE_MAX_LANGUAGE = 35;

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/u;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

export type ValidYouTubeSourceInput = {
  videoId: string;
  canonicalUrl: string;
  requestedLanguage: string | null;
};

export type YouTubeImportResult =
  | { ok: true; state: "ready" | "indexing"; sourceId: string }
  | { ok: true; state: "processing"; importId: string }
  | {
      ok: false;
      error:
        | "invalid-url"
        | "invalid-language"
        | "provider-not-configured"
        | "transcript-unavailable"
        | "provider-failed"
        | "source-exists"
        | "storage-failed"
        | "index-failed"
        | "transcript-too-large";
    };

export type YouTubeImportRefreshResult =
  | { ok: true; state: "ready" | "indexing"; sourceId: string }
  | { ok: true; state: "processing"; importId: string }
  | { ok: false; error: "invalid-request" | "not-found" | "provider-not-configured" | "provider-failed" | "transcript-unavailable" | "storage-failed" | "index-failed" | "transcript-too-large" };

function videoIdFromUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === "youtu.be") {
    const segment = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID_PATTERN.test(segment) ? segment : null;
  }

  if (url.pathname === "/watch") {
    const candidate = url.searchParams.get("v") ?? "";
    return VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
  }

  const [kind, candidate] = url.pathname.split("/").filter(Boolean);
  if (["shorts", "live", "embed"].includes(kind ?? "") && VIDEO_ID_PATTERN.test(candidate ?? "")) {
    return candidate ?? null;
  }
  return null;
}

/** Canonicalizes supported YouTube watch, short, live, and embed URLs to one stable video identity. */
export function validateYouTubeSourceUrl(value: unknown): Omit<ValidYouTubeSourceInput, "requestedLanguage"> | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const videoId = videoIdFromUrl(url);
  if (!videoId) return null;
  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

/** Normalizes an optional ISO-style transcript language hint without trusting it as provider output. */
export function validateYouTubeLanguage(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;
  const language = value.trim();
  if (!language || language.length > YOUTUBE_SOURCE_MAX_LANGUAGE || !LANGUAGE_PATTERN.test(language)) return null;
  const [primary, ...rest] = language.split("-");
  return [primary.toLowerCase(), ...rest.map((part) => part.length === 2 ? part.toUpperCase() : part)].join("-");
}

/** Validates the Admin YouTube import payload before any provider or database work. */
export function validateYouTubeSourceInput(input: unknown): ValidYouTubeSourceInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as { url?: unknown; language?: unknown };
  const source = validateYouTubeSourceUrl(raw.url);
  const language = validateYouTubeLanguage(raw.language);
  if (!source || language === null) return null;
  return { ...source, requestedLanguage: language || null };
}

/** Checks UUID-shaped import identifiers before service-only staging lookups. */
export function validateYouTubeImportId(value: unknown) {
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as { importId?: unknown }).importId
      : null;
  return typeof candidate === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate)
    ? candidate
    : null;
}

/** Creates the durable text artifact stored privately before Knowledge indexing. */
export function buildYouTubeTranscriptArtifact(input: {
  title: string;
  channelName: string | null;
  canonicalUrl: string;
  language: string | null;
  transcript: string;
}) {
  const title = input.title.trim().slice(0, 200);
  const transcript = input.transcript.trim();
  if (!title || !transcript || transcript.length > YOUTUBE_TRANSCRIPT_MAX_CHARS) return null;
  const content = [
    `YouTube title: ${title}`,
    input.channelName?.trim() ? `Channel: ${input.channelName.trim().slice(0, 200)}` : "",
    `Canonical URL: ${input.canonicalUrl}`,
    input.language?.trim() ? `Transcript language: ${input.language.trim().slice(0, YOUTUBE_SOURCE_MAX_LANGUAGE)}` : "",
    "",
    "TRANSCRIPT",
    transcript,
  ].filter((line, index) => line !== "" || index === 4).join("\n");
  const bytes = new TextEncoder().encode(content);
  if (!bytes.length || bytes.length > YOUTUBE_TRANSCRIPT_MAX_BYTES) return null;
  return { content, bytes, title };
}
