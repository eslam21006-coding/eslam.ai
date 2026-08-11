export type GenerationClaim =
  | { status: "claimed"; token: string }
  | { status: "busy" }
  | { status: "failed" };

export type ResponseFlowResult =
  | { kind: "redirect"; conversationId: string; responseSaved: boolean }
  | { kind: "form_error"; error: "save_failed" | "response_in_progress" };

export type PreparedResponseTurn<Message> = {
  kind: "ready";
  conversationId: string;
  claimToken: string;
  messages: Message[];
};

export type ResponsePreparationResult<Message> =
  | PreparedResponseTurn<Message>
  | { kind: "saved_error"; conversationId: string }
  | { kind: "form_error"; error: "save_failed" | "response_in_progress" };

type ConversationThread<Message> = {
  messages: Message[];
};

export type ResponsePreparationDependencies<Message> = {
  createConversation(content: string): Promise<string>;
  claimGeneration(userId: string, conversationId: string): Promise<GenerationClaim>;
  releaseGeneration(userId: string, conversationId: string, token: string): Promise<void>;
  insertUserMessage(userId: string, conversationId: string, content: string): Promise<void>;
  loadConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationThread<Message> | null>;
  reportError(stage: string, error: unknown): void;
};

export type ResponseFlowDependencies<Message> = ResponsePreparationDependencies<Message> & {
  generateReply(messages: Message[]): Promise<string>;
  persistAssistant(userId: string, conversationId: string, content: string): Promise<void>;
};

export type MessageResponseInput = {
  userId: string;
  conversationId: string | null;
  content: string;
};

async function releaseClaim<Message>(
  userId: string,
  conversationId: string,
  token: string,
  dependencies: ResponsePreparationDependencies<Message>,
) {
  try {
    await dependencies.releaseGeneration(userId, conversationId, token);
  } catch (error) {
    dependencies.reportError("generation_release", error);
  }
}

async function loadPreparedThread<Message>(
  userId: string,
  conversationId: string,
  token: string,
  dependencies: ResponsePreparationDependencies<Message>,
): Promise<ResponsePreparationResult<Message>> {
  try {
    const thread = await dependencies.loadConversation(userId, conversationId);
    if (!thread) {
      throw new Error("Conversation disappeared before response generation.");
    }

    return {
      kind: "ready",
      conversationId,
      claimToken: token,
      messages: thread.messages,
    };
  } catch (error) {
    dependencies.reportError("conversation_load", error);
    await releaseClaim(userId, conversationId, token, dependencies);
    return { kind: "saved_error", conversationId };
  }
}

export async function prepareMessageResponseFlow<Message>(
  input: MessageResponseInput,
  dependencies: ResponsePreparationDependencies<Message>,
): Promise<ResponsePreparationResult<Message>> {
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
      return { kind: "saved_error", conversationId };
    }

    return loadPreparedThread(userId, conversationId, claim.token, dependencies);
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

  return loadPreparedThread(userId, conversationId, claim.token, dependencies);
}

export async function executeMessageResponseFlow<Message>(
  input: MessageResponseInput,
  dependencies: ResponseFlowDependencies<Message>,
): Promise<ResponseFlowResult> {
  const prepared = await prepareMessageResponseFlow(input, dependencies);

  if (prepared.kind === "form_error") {
    return prepared;
  }
  if (prepared.kind === "saved_error") {
    return {
      kind: "redirect",
      conversationId: prepared.conversationId,
      responseSaved: false,
    };
  }

  let responseSaved = false;
  try {
    const assistantContent = await dependencies.generateReply(prepared.messages);
    await dependencies.persistAssistant(
      input.userId,
      prepared.conversationId,
      assistantContent,
    );
    responseSaved = true;
  } catch (error) {
    dependencies.reportError("assistant_response", error);
  } finally {
    await releaseClaim(
      input.userId,
      prepared.conversationId,
      prepared.claimToken,
      dependencies,
    );
  }

  return {
    kind: "redirect",
    conversationId: prepared.conversationId,
    responseSaved,
  };
}
