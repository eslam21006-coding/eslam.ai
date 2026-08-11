type ReplayMessage = {
  role: string;
  content: string;
};

type ReplayRole = "user" | "assistant";

export type BasicEslamResponseRequest = {
  model: string;
  instructions: string;
  input: Array<{ role: ReplayRole; content: string }>;
  max_output_tokens: number;
  store: false;
};

const MAX_MODEL_TRANSCRIPT_MESSAGES = 64;
const MAX_ESTIMATED_TRANSCRIPT_TOKENS = 32_000;
const ESTIMATED_MESSAGE_OVERHEAD_TOKENS = 8;

const BASIC_ESLAM_INSTRUCTIONS = [
  "You are Eslam.AI, an AI business and marketing mentor.",
  "Reply primarily in Arabic unless the user writes in English or asks for another language.",
  "Keep familiar marketing and business terms in English when that is clearer and more natural.",
  "Be direct, practical, diagnostic, and specific. Avoid generic motivational filler.",
  "Ask one high-value question only when essential; otherwise give a concrete recommendation or next action.",
  "Do not claim to be the human Eslam Salah, and do not invent facts about the user's business or history.",
  "The supplied transcript may contain only the most recent conversation window, so never invent omitted earlier details.",
].join("\n");

function estimateMessageTokens(message: ReplayMessage) {
  // One token per UTF-16 character is intentionally conservative for normal Arabic/English chat.
  return message.content.length + ESTIMATED_MESSAGE_OVERHEAD_TOKENS;
}

function selectRecentTranscript(messages: ReplayMessage[]) {
  const replayable = messages.filter(
    (message): message is ReplayMessage & { role: ReplayRole } =>
      message.role === "user" || message.role === "assistant",
  );
  const selected: Array<ReplayMessage & { role: ReplayRole }> = [];
  let estimatedTokens = 0;

  for (let index = replayable.length - 1; index >= 0; index -= 1) {
    if (selected.length >= MAX_MODEL_TRANSCRIPT_MESSAGES) break;

    const message = replayable[index];
    const messageTokens = estimateMessageTokens(message);
    if (selected.length > 0 && estimatedTokens + messageTokens > MAX_ESTIMATED_TRANSCRIPT_TOKENS) {
      break;
    }

    selected.push(message);
    estimatedTokens += messageTokens;
  }

  return selected.reverse().map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function buildBasicEslamResponseRequest(
  messages: ReplayMessage[],
  model: string,
): BasicEslamResponseRequest {
  const input = selectRecentTranscript(messages);
  if (input.length === 0) {
    throw new Error("Conversation does not contain model input.");
  }

  return {
    model,
    instructions: BASIC_ESLAM_INSTRUCTIONS,
    input,
    max_output_tokens: 1800,
    store: false,
  };
}
