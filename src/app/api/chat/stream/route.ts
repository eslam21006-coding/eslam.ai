import { revalidatePath } from "next/cache";

import { loadBusinessDnaModelContext } from "@/features/business-dna/model-context-data";
import {
  persistAssistantMessage,
  streamBasicEslamReply,
} from "@/features/conversations/assistant";
import {
  CHAT_STREAM_CONTENT_TYPE,
  serializeChatStreamEvent,
  type ChatStreamEvent,
} from "@/features/conversations/chat-stream-protocol";
import { isUuid, MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";
import { prepareMessageResponseFlow } from "@/features/conversations/response-flow";
import { createResponsePreparationDependencies } from "@/features/conversations/response-flow-server";
import { executePreparedStreamingResponse } from "@/features/conversations/streaming-response-flow";
import { loadEslamBrainModelContext } from "@/features/eslam-brain/model-context-data";
import { loadKnowledgeVectorStoreId } from "@/features/knowledge-library/model-context-data";
import { isAdmin } from "@/lib/auth/admin";
import { getAuthenticatedUserId } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONVERSATION_HEADER = "X-Eslam-Conversation-Id";

type StreamRequestBody = {
  content?: unknown;
  conversationId?: unknown;
};

function errorResponse(
  status: number,
  error: string,
  options: { conversationId?: string; userMessageSaved?: boolean } = {},
) {
  return Response.json(
    {
      error,
      conversationId: options.conversationId ?? null,
      userMessageSaved: options.userMessageSaved ?? false,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function parseStreamInput(body: StreamRequestBody) {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < 1 || content.length > MAX_MESSAGE_LENGTH) {
    return null;
  }

  if (body.conversationId === undefined || body.conversationId === null || body.conversationId === "") {
    return { content, conversationId: null };
  }

  if (typeof body.conversationId !== "string" || !isUuid(body.conversationId)) {
    return null;
  }

  return { content, conversationId: body.conversationId };
}

function invalidateConversation(conversationId: string) {
  revalidatePath(`/app/chat/${conversationId}`);
  revalidatePath("/app", "layout");
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse(401, "unauthorized");
  }

  let body: StreamRequestBody;
  try {
    body = (await request.json()) as StreamRequestBody;
  } catch {
    return errorResponse(400, "invalid_input");
  }

  const input = parseStreamInput(body);
  if (!input) {
    return errorResponse(400, "invalid_input");
  }

  const [businessDnaContext, eslamBrainContext, knowledgeVectorStoreId, knowledgeSourceAttributionAllowed] = await Promise.all([
    loadBusinessDnaModelContext(userId),
    loadEslamBrainModelContext(),
    loadKnowledgeVectorStoreId(),
    isAdmin(),
  ]);
  const preparationDependencies = await createResponsePreparationDependencies();
  const prepared = await prepareMessageResponseFlow(
    { userId, conversationId: input.conversationId, content: input.content },
    preparationDependencies,
  );

  if (prepared.kind === "form_error") {
    return errorResponse(
      prepared.error === "response_in_progress" ? 409 : 500,
      prepared.error,
    );
  }

  if (prepared.kind === "saved_error") {
    invalidateConversation(prepared.conversationId);
    return errorResponse(503, "response_failed", {
      conversationId: prepared.conversationId,
      userMessageSaved: true,
    });
  }

  invalidateConversation(prepared.conversationId);

  const encoder = new TextEncoder();
  const upstreamAbort = new AbortController();
  let cancelled = false;

  const abortFromRequest = () => {
    cancelled = true;
    upstreamAbort.abort();
  };

  if (request.signal.aborted) {
    abortFromRequest();
  } else {
    request.signal.addEventListener("abort", abortFromRequest, { once: true });
  }

  const bodyStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatStreamEvent) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(serializeChatStreamEvent(event)));
      };

      send({ type: "ready", conversationId: prepared.conversationId });

      void executePreparedStreamingResponse(
        {
          userId,
          prepared,
          signal: upstreamAbort.signal,
          onDelta: (delta) => {
            if (cancelled) {
              throw new DOMException("Streaming response cancelled.", "AbortError");
            }
            send({ type: "delta", delta });
          },
        },
        {
          streamReply: (messages, options) =>
            streamBasicEslamReply(
              messages,
              options,
              businessDnaContext,
              eslamBrainContext,
              knowledgeVectorStoreId,
              knowledgeSourceAttributionAllowed,
            ),
          persistAssistant: persistAssistantMessage,
          releaseGeneration: preparationDependencies.releaseGeneration,
          reportError: preparationDependencies.reportError,
        },
      )
        .then(() => {
          if (!cancelled) {
            send({ type: "done" });
            controller.close();
          }
        })
        .catch(() => {
          if (!cancelled) {
            send({
              type: "error",
              error: "response_failed",
              userMessageSaved: true,
            });
            controller.close();
          }
        })
        .finally(() => {
          request.signal.removeEventListener("abort", abortFromRequest);
        });
    },
    cancel() {
      cancelled = true;
      upstreamAbort.abort();
    },
  });

  return new Response(bodyStream, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": CHAT_STREAM_CONTENT_TYPE,
      [CONVERSATION_HEADER]: prepared.conversationId,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
