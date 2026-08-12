import "server-only";

import OpenAI from "openai";

import { resolveVoiceTranscriptionModel } from "@/features/voice-transcription/core";

const OPENAI_TIMEOUT_MS = 45_000;
const OPENAI_TRANSCRIPTION_TIMEOUT_MS = 225_000;
const OPENAI_VOICE_TEACHING_TIMEOUT_MS = 120_000;
const OPENAI_MAX_RETRIES = 1;
const OPENAI_TRANSCRIPTION_MAX_RETRIES = 0;
const OPENAI_VOICE_TEACHING_MAX_RETRIES = 0;

let openaiClient: OpenAI | null = null;
let openaiTranscriptionClient: OpenAI | null = null;
let openaiVoiceTeachingClient: OpenAI | null = null;

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return apiKey;
}

/** Returns the shared bounded client for normal chat responses. */
export function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: getApiKey(),
      maxRetries: OPENAI_MAX_RETRIES,
      timeout: OPENAI_TIMEOUT_MS,
    });
  }
  return openaiClient;
}

/** Returns the long-running transcription client with SDK retries disabled. */
export function getOpenAITranscriptionClient() {
  if (!openaiTranscriptionClient) {
    openaiTranscriptionClient = new OpenAI({
      apiKey: getApiKey(),
      maxRetries: OPENAI_TRANSCRIPTION_MAX_RETRIES,
      timeout: OPENAI_TRANSCRIPTION_TIMEOUT_MS,
    });
  }
  return openaiTranscriptionClient;
}

/** Returns a dedicated Voice → Teaching client whose request budget stays below the extraction lease. */
export function getOpenAIVoiceTeachingClient() {
  if (!openaiVoiceTeachingClient) {
    openaiVoiceTeachingClient = new OpenAI({
      apiKey: getApiKey(),
      maxRetries: OPENAI_VOICE_TEACHING_MAX_RETRIES,
      timeout: OPENAI_VOICE_TEACHING_TIMEOUT_MS,
    });
  }
  return openaiVoiceTeachingClient;
}

/** Resolves the main chat model. */
export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

/** Resolves the speech-to-text model. */
export function getOpenAITranscriptionModel() {
  return resolveVoiceTranscriptionModel(process.env.OPENAI_TRANSCRIPTION_MODEL);
}

/** Resolves the Voice → Teaching model while preserving the main-model fallback. */
export function getOpenAIVoiceTeachingModel() {
  return process.env.OPENAI_VOICE_TEACHING_MODEL?.trim() || getOpenAIModel();
}
