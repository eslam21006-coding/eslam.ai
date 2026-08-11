import "server-only";

import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}
