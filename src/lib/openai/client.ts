import "server-only";

import OpenAI from "openai";

import { resolveVoiceTranscriptionModel } from "@/features/voice-transcription/core";

const OPENAI_TIMEOUT_MS = 45_000;
const OPENAI_TRANSCRIPTION_TIMEOUT_MS = 225_000;
const OPENAI_MAX_RETRIES = 1;
const OPENAI_TRANSCRIPTION_MAX_RETRIES = 0;

let openaiClient: OpenAI | null = null;
let openaiTranscriptionClient: OpenAI | null = null;

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return apiKey;
}

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

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

export function getOpenAITranscriptionModel() {
  return resolveVoiceTranscriptionModel(process.env.OPENAI_TRANSCRIPTION_MODEL);
}
