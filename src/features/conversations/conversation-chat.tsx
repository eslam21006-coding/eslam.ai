"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  COMPOSER_FOCUS_STORAGE_KEY,
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
  clearResponseErrorOnSuccess?: boolean;
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
  const waitingForFirstToken = streaming && content.length === 0;

  return (
    <article
      className={isUser ? "mr-auto max-w-[88%] sm:max-w-[75%]" : "max-w-[92%] sm:max-w-[82%]"}
      aria-live={streaming && !waitingForFirstToken ? "polite" : undefined}
    >
      <span className="sr-only">{authorLabel}</span>
      <div
        className={
          isUser
            ? "rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3.5"
            : "px-1 py-1"
        }
      >
        {waitingForFirstToken ? (
          <span
            role="status"
            aria-label="إسلام يكتب"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-subtle)]"
          >
            <span>إسلام يكتب</span>
            <span aria-hidden="true" className="animate-pulse text-[var(--gold-muted)]">…</span>
          </span>
        ) : (
          <p
            dir="auto"
            className="text-mixed whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere] sm:text-[0.95rem]"
          >
            {content}
          </p>
        )}
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

function rememberComposerFocus(conversationId: string) {
  try {
    window.sessionStorage.setItem(COMPOSER_FOCUS_STORAGE_KEY, conversationId);
  } catch {
    // Focus continuity is optional UX; navigation must still succeed if storage is unavailable.
  }
}

export function ConversationChat({
  conversationId,
  initialMessages,
  showEmptyState = false,
  clearResponseErrorOnSuccess = false,
}: ConversationChatProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [optimisticTurn, setOptimisticTurn] = useState<OptimisticTurn | null>(null);
  const [optimisticBaseMessageCount, setOptimisticBaseMessageCount] = useState<number | null>(null);
  const [streamingError, setStreamingError] = useState<ComposerError>(null);
  const [streaming, setStreaming] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);
  const followingLatestRef = useRef(true);

  const optimisticTurnIsPersisted =
    optimisticTurn !== null &&
    optimisticBaseMessageCount !== null &&
    initialMessages.length > optimisticBaseMessageCount;
  const visibleOptimisticTurn = optimisticTurnIsPersisted ? null : optimisticTurn;
  const hasMessages = initialMessages.length > 0 || visibleOptimisticTurn !== null;
  const streamedAssistantLength = visibleOptimisticTurn?.assistant.length ?? 0;

  const clearOptimisticTurn = () => {
    setOptimisticBaseMessageCount(null);
    setOptimisticTurn(null);
  };

  const scrollToLatest = (behavior: ScrollBehavior = "auto") => {
    followingLatestRef.current = true;
    setShowJumpToLatest(false);
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const endNode = endRef.current;
    if (!endNode || !hasMessages) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const atLatest = entry.isIntersecting;
        followingLatestRef.current = atLatest;
        setShowJumpToLatest(!atLatest);
      },
      { root: null, threshold: 0.01, rootMargin: "0px 0px 120px 0px" },
    );

    observer.observe(endNode);
    return () => observer.disconnect();
  }, [hasMessages, conversationId]);

  useEffect(() => {
    if (!hasMessages || !followingLatestRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasMessages, initialMessages.length, visibleOptimisticTurn, streamedAssistantLength]);

  useEffect(() => {
    if (!initialMessages.length) return;

    followingLatestRef.current = true;
    const frame = window.requestAnimationFrame(() => scrollToLatest("auto"));
    return () => window.cancelAnimationFrame(frame);
    // Scroll once when entering a persisted thread; later updates obey the user's follow-latest position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (streaming) return;

    const formData = new FormData(event.currentTarget);
    const rawContent = formData.get("content");
    const submittedContent = typeof rawContent === "string" ? rawContent.trim() : "";
    if (
      submittedContent.length < 1 ||
      submittedContent.length > MAX_MESSAGE_LENGTH
    ) {
      setStreamingError("invalid_input");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;
    setOptimisticBaseMessageCount(initialMessages.length);
    followingLatestRef.current = true;
    setShowJumpToLatest(false);
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
          clearOptimisticTurn();
          router.replace(
            `/app/chat/${payload.conversationId}?error=response_failed`,
            { scroll: false },
          );
          return;
        }

        clearOptimisticTurn();
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

      const cleanConversationUrl = `/app/chat/${targetConversationId}`;
      const startsNewThread = targetConversationId !== conversationId;
      if (startsNewThread) {
        rememberComposerFocus(targetConversationId);
      }

      if (startsNewThread || clearResponseErrorOnSuccess) {
        router.replace(cleanConversationUrl, { scroll: false });
      } else {
        router.refresh();
      }
    } catch (error) {
      if (abortController.signal.aborted || !mountedRef.current) return;

      clearOptimisticTurn();
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
          <div className="mx-auto grid w-full max-w-3xl gap-7 sm:gap-8">
            {initialMessages.map((message) => (
              <MessageArticle
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))}
            {visibleOptimisticTurn ? (
              <>
                <MessageArticle role="user" content={visibleOptimisticTurn.user} />
                <MessageArticle
                  role="assistant"
                  content={visibleOptimisticTurn.assistant}
                  streaming={streaming}
                />
              </>
            ) : null}
            <div ref={endRef} aria-hidden="true" className="h-px scroll-mb-32" />
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

      {showJumpToLatest && hasMessages ? (
        <div className="fixed bottom-28 left-1/2 z-20 w-fit -translate-x-1/2 sm:bottom-32 lg:left-[calc(50%-9rem)]">
          <button
            type="button"
            onClick={() => scrollToLatest("smooth")}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-3.5 text-xs font-medium text-[var(--foreground-muted)] shadow-[var(--shadow-soft)] backdrop-blur-xl transition-colors hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
          >
            <span>آخر رسالة</span>
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      ) : null}

      <footer className="sticky bottom-0 z-10 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pb-4 pt-3 sm:pb-6">
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
