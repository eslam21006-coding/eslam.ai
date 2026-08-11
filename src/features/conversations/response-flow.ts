export type GenerationClaim =
  | { status: "claimed"; token: string }
  | { status: "busy" }
  | { status: "failed" };

export type ResponseFlowResult =
  | { kind: "redirect"; conversationId: string; responseSaved: boolean }
  | { kind: "form_error"; error: "save_failed" | "response_in_progress" };

type ConversationThread<Message> = {
  messages: Message[];
};

export type ResponseFlowDependencies<Message> = {
  createConversation(content: string): Promise<string>;
  claimGeneration(userId: string, conversationId: string): Promise<GenerationClaim>;
  releaseGeneration(userId: string, conversationId: string, token: string): Promise<void>;
  insertUserMessage(userId: string, conversationId: string, content: string): Promise<void>;
  loadConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationThread<Message> | null>;
  generateReply(messages: Message[]): Promise<string>;
  persistAssistant(userId: string, conversationId: string, content: string): Promise<void>;
  reportError(stage: string, error: unknown): void;
};

type MessageResponseInput = {
  userId: string;
  conversationId: string | null;
  content: string;
};

async function generateAndPersist<Message>(
  userId: string,
  conversationId: string,
  dependencies: ResponseFlowDependencies<Message>,
) {
  try {
    const thread = await dependencies.loadConversation(userId, conversationId);
    if (!thread) {
      throw new Error("Conversation disappeared before response generation.");
    }

    const assistantContent = await dependencies.generateReply(thread.messages);
    await dependencies.persistAssistant(userId, conversationId, assistantContent);
    return true;
  } catch (error) {
    dependencies.reportError("assistant_response", error);
    return false;
  }
}

async function releaseClaim<Message>(
  userId: string,
  conversationId: string,
  token: string,
  dependencies: ResponseFlowDependencies<Message>,
) {
  try {
    await dependencies.releaseGeneration(userId, conversationId, token);
  } catch (error) {
    dependencies.reportError("generation_release", error);
  }
}

export async function executeMessageResponseFlow<Message>(
  input: MessageResponseInput,
  dependencies: ResponseFlowDependencies<Message>,
): Promise<ResponseFlowResult> {
  const { userId, content } = input;

  if (input.conversationId === null) {
    let conversationId: string;
    try {
      conversationId = await dependencies.createConversation(content);
    } catch (error) {
      dependencies.reportError("conversation_create", error);
      return { kind: "form_error", error: "save_failed" };
    }

    const claim = await dependencies.claimGeneration(userId, conversationId);
    if (claim.status !== "claimed") {
      return { kind: "redirect", conversationId, responseSaved: false };
    }

    const responseSaved = await generateAndPersist(userId, conversationId, dependencies);
    await releaseClaim(userId, conversationId, claim.token, dependencies);
    return { kind: "redirect", conversationId, responseSaved };
  }

  const conversationId = input.conversationId;
  const claim = await dependencies.claimGeneration(userId, conversationId);
  if (claim.status === "busy") {
    return { kind: "form_error", error: "response_in_progress" };
  }
  if (claim.status === "failed") {
    return { kind: "form_error", error: "save_failed" };
  }

  try {
    await dependencies.insertUserMessage(userId, conversationId, content);
  } catch (error) {
    dependencies.reportError("user_message_insert", error);
    await releaseClaim(userId, conversationId, claim.token, dependencies);
    return { kind: "form_error", error: "save_failed" };
  }

  const responseSaved = await generateAndPersist(userId, conversationId, dependencies);
  await releaseClaim(userId, conversationId, claim.token, dependencies);
  return { kind: "redirect", conversationId, responseSaved };
}
