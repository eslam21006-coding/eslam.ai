import type { PreparedResponseTurn } from "@/features/conversations/response-flow";

type StreamingResponseDependencies<Message> = {
  streamReply(
    messages: Message[],
    options: { signal: AbortSignal; onDelta(delta: string): void },
  ): Promise<string>;
  persistAssistant(userId: string, conversationId: string, content: string): Promise<void>;
  releaseGeneration(userId: string, conversationId: string, token: string): Promise<void>;
  reportError(stage: string, error: unknown): void;
};

type StreamingResponseInput<Message> = {
  userId: string;
  prepared: PreparedResponseTurn<Message>;
  signal: AbortSignal;
  onDelta(delta: string): void;
};

async function releasePreparedTurn<Message>(
  input: StreamingResponseInput<Message>,
  dependencies: StreamingResponseDependencies<Message>,
) {
  try {
    await dependencies.releaseGeneration(
      input.userId,
      input.prepared.conversationId,
      input.prepared.claimToken,
    );
  } catch (error) {
    dependencies.reportError("generation_release", error);
  }
}

export async function executePreparedStreamingResponse<Message>(
  input: StreamingResponseInput<Message>,
  dependencies: StreamingResponseDependencies<Message>,
) {
  try {
    let assistantContent: string;
    try {
      assistantContent = await dependencies.streamReply(input.prepared.messages, {
        signal: input.signal,
        onDelta: input.onDelta,
      });
    } catch (error) {
      dependencies.reportError("assistant_stream", error);
      throw error;
    }

    if (input.signal.aborted) {
      throw new DOMException("Streaming response aborted.", "AbortError");
    }

    try {
      await dependencies.persistAssistant(
        input.userId,
        input.prepared.conversationId,
        assistantContent,
      );
    } catch (error) {
      dependencies.reportError("assistant_persist", error);
      throw error;
    }
  } finally {
    await releasePreparedTurn(input, dependencies);
  }
}
