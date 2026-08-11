"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  ConversationComposer,
  type ComposerError,
} from "@/features/conversations/conversation-composer";
import {
  MAX_MESSAGE_LENGTH,
  type MessageRecord,
} from "@/features/conversations/contracts";

type ConversationChatProps = {
  conversationId?: string;
  initialMessages: MessageRecord[];
  showEmptyState?: boolean;
};

type OptimisticTurn = {
  user: string;
  assistant: string;
};

type ErrorPayload = {
  error?: string;
  conversationId?: string | null;
  userMessageSaved?: boolean;
};

function MessageArticle({
  role,
  content,
  streaming = false,
}: {
  role: string;
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  const authorLabel = isUser ? "أنت:" : role === "assistant" ? "إسلام:" : "النظام:";

  return (
    <article
      className={isUser ? "mr-auto max-w-[88%] sm:max-w-[75%]" : "max-w-[92%] sm:max-w-[82%]"}
      aria-live={streaming ? "polite" : undefined}
    >
      <span className="sr-only">{authorLabel}</span>
      <div
        className={
          isUser
            ? "rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3.5"
            : "px-1 py-1"
        }
      >
        <p className="text-mixed whitespace-pre-wrap text-sm leading-7 sm:text-[0.95rem]">
          {content || (streaming ? "…" : "")}
        </p>
      </div>
    </article>
  );
}

function localErrorFromServer(error: string | undefined): ComposerError {
  if (error === "invalid_input") return "invalid_input";
  if (error === "response_in_progress") return "response_in_progress";
  if (error === "save_failed") return "save_failed";
  return "network_uncertain";
}

export function ConversationChat({
  conversationId,
  initialMessages,
  showEmptyState = false,
}: ConversationChatProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [optimisticTurn, setOptimisticTurn] = useState<OptimisticTurn | null>(null);
  const [streamingError, setStreamingError] = useState<ComposerError>(null);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (streaming) return;

    const submittedContent = draft.trim();
    if (
      submittedContent.length < 1 ||
      submittedContent.length > MAX_MESSAGE_LENGTH
    ) {
      setStreamingError("invalid_input");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setStreamingError(null);
    setStreaming(true);
    setOptimisticTurn({ user: submittedContent, assistant: "" });
    setDraft("");

    let responseStarted = false;
    let targetConversationId = conversationId ?? null;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: submittedContent,
          conversationId: conversationId ?? null,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ErrorPayload;

        if (response.status === 401) {
          router.replace("/auth/login");
          return;
        }

        if (payload.userMessageSaved && payload.conversationId) {
          setOptimisticTurn(null);
          router.replace(
            `/app/chat/${payload.conversationId}?error=response_failed`,
            { scroll: false },
          );
          return;
        }

        setOptimisticTurn(null);
        setDraft((current) => current || submittedContent);
        setStreamingError(localErrorFromServer(payload.error));
        return;
      }

      responseStarted = true;
      targetConversationId = response.headers.get("X-Eslam-Conversation-Id");
      if (!targetConversationId || !response.body) {
        throw new Error("Streaming response is missing its conversation metadata or body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const delta = decoder.decode(value, { stream: true });
        if (!delta) continue;

        setOptimisticTurn((current) =>
          current
            ? { ...current, assistant: current.assistant + delta }
            : current,
        );
      }

      const tail = decoder.decode();
      if (tail) {
        setOptimisticTurn((current) =>
          current
            ? { ...current, assistant: current.assistant + tail }
            : current,
        );
      }

      if (!mountedRef.current) return;

      setOptimisticTurn(null);
      router.replace(`/app/chat/${targetConversationId}`, { scroll: false });
    } catch (error) {
      if (abortController.signal.aborted || !mountedRef.current) return;

      setOptimisticTurn(null);
      if (responseStarted && targetConversationId) {
        router.replace(
          `/app/chat/${targetConversationId}?error=response_failed`,
          { scroll: false },
        );
      } else {
        setDraft((current) => current || submittedContent);
        setStreamingError("network_uncertain");
      }

      console.error("streaming chat request failed", {
        message: error instanceof Error ? error.message : "Unknown streaming error",
      });
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
      if (mountedRef.current) {
        setStreaming(false);
      }
    }
  }

  const hasMessages = initialMessages.length > 0 || optimisticTurn !== null;

  return (
    <>
      <section
        aria-label={showEmptyState ? "محادثة جديدة" : "المحادثة"}
        aria-busy={streaming}
        className={
          hasMessages
            ? "flex flex-1 flex-col justify-end py-8 sm:py-12"
            : "flex flex-1 items-center py-10 sm:py-14"
        }
      >
        {hasMessages ? (
          <div className="mx-auto grid w-full max-w-3xl gap-6">
            {initialMessages.map((message) => (
              <MessageArticle
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))}
            {optimisticTurn ? (
              <>
                <MessageArticle role="user" content={optimisticTurn.user} />
                <MessageArticle
                  role="assistant"
                  content={optimisticTurn.assistant}
                  streaming
                />
              </>
            ) : null}
          </div>
        ) : showEmptyState ? (
          <div className="mx-auto w-full max-w-3xl text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--gold-soft)] text-lg font-semibold text-[var(--gold-bright)]">
              إ
            </div>
            <h2 className="mt-4 text-xl font-semibold sm:text-2xl">إيه اللي شاغلك دلوقتي؟</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-[var(--foreground-muted)]">
              احكي الوضع بطريقتك. أول رسالة هتبدأ محادثة محفوظة تقدر ترجع لها بعدين.
            </p>
          </div>
        ) : null}
      </section>

      <footer className="sticky bottom-0 pb-4 pt-2 sm:pb-6">
        <ConversationComposer
          conversationId={conversationId}
          value={draft}
          onValueChange={setDraft}
          onStreamingSubmit={handleSubmit}
          streaming={streaming}
          streamingError={streamingError}
        />
      </footer>
    </>
  );
}
