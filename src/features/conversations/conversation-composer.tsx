"use client";

import {
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  persistUserMessageAction,
  type MessageActionState,
} from "@/features/conversations/actions";
import { MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";
import { MessageSubmitButton } from "@/features/conversations/message-submit-button";

export const COMPOSER_FOCUS_STORAGE_KEY = "eslam-ai:focus-composer";

export type ComposerError = MessageActionState["error"] | "network_uncertain";

type ConversationComposerProps = {
  conversationId?: string;
  value?: string;
  onValueChange(value: string): void;
  onStreamingSubmit(event: FormEvent<HTMLFormElement>): void;
  streaming: boolean;
  streamingError: ComposerError;
};

function errorMessage(error: ComposerError) {
  if (error === "invalid_input") {
    return "اكتب رسالة قبل الإرسال، وتأكد أنها ليست أطول من الحد المسموح.";
  }
  if (error === "response_in_progress") {
    return "إسلام ما زال ينشئ الرد السابق. احتفظنا برسالتك هنا؛ أرسلها بعد اكتمال الرد.";
  }
  if (error === "network_uncertain") {
    return "انقطع الاتصال قبل ما نقدر نتأكد من حفظ الرسالة. راجع المحادثات السابقة قبل إعادة الإرسال.";
  }
  if (error === "save_failed") {
    return "تعذر حفظ الرسالة. احتفظنا بالنص؛ حاول مرة أخرى.";
  }
  return null;
}

export function ConversationComposer({
  conversationId,
  value,
  onValueChange,
  onStreamingSubmit,
  streaming,
  streamingError,
}: ConversationComposerProps) {
  const initialState: MessageActionState = {
    content: "",
    error: null,
    revision: 0,
  };
  const [fallbackState, fallbackAction] = useActionState(
    persistUserMessageAction,
    initialState,
  );
  const displayedError = streamingError ?? fallbackState.error;
  const displayedValue = value ?? fallbackState.content;
  const message = errorMessage(displayedError);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasStreamingRef = useRef(streaming);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [displayedValue]);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = streaming;

    if (!wasStreaming || streaming) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    textareaRef.current?.focus({ preventScroll: true });
  }, [streaming]);

  useEffect(() => {
    if (!conversationId) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let shouldRestoreFocus = false;
    try {
      shouldRestoreFocus =
        window.sessionStorage.getItem(COMPOSER_FOCUS_STORAGE_KEY) === conversationId;
      if (shouldRestoreFocus) {
        window.sessionStorage.removeItem(COMPOSER_FOCUS_STORAGE_KEY);
      }
    } catch {
      return;
    }

    if (!shouldRestoreFocus) return;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.nativeEvent.isComposing ||
      streaming
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form
      action={fallbackAction}
      onSubmit={onStreamingSubmit}
      className="mx-auto max-w-3xl"
      aria-busy={streaming}
    >
      {conversationId ? (
        <input type="hidden" name="conversation_id" value={conversationId} />
      ) : null}

      {message ? (
        <p
          role="alert"
          className="mb-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-6 text-[var(--foreground-muted)]"
        >
          {message}
        </p>
      ) : null}

      <div className="rounded-[1.4rem] border border-[var(--border-strong)] bg-[var(--surface)] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.45)] transition-colors focus-within:border-[var(--gold-muted)]">
        <textarea
          ref={textareaRef}
          name="content"
          aria-label="رسالتك"
          placeholder="اكتب لإسلام..."
          rows={1}
          required
          maxLength={MAX_MESSAGE_LENGTH}
          value={displayedValue}
          disabled={streaming}
          aria-disabled={streaming}
          onKeyDown={handleKeyDown}
          onChange={(event) => onValueChange(event.target.value)}
          className="block min-h-14 max-h-40 w-full resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-sm leading-7 text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] disabled:cursor-wait disabled:opacity-70"
        />
        <div className="flex items-center gap-3 px-1 pb-1">
          <button
            type="button"
            disabled
            aria-label="إضافة مرفق — قريباً"
            className="grid size-11 shrink-0 place-items-center rounded-full text-xl text-[var(--foreground-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">+</span>
          </button>
          <span className="hidden flex-1 text-center text-[11px] text-[var(--foreground-subtle)] sm:inline">
            Enter للإرسال · Shift + Enter لسطر جديد
          </span>
          <div className="mr-auto shrink-0">
            <MessageSubmitButton streaming={streaming} />
          </div>
        </div>
      </div>
    </form>
  );
}
