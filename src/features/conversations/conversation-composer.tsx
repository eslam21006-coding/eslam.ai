"use client";

import { useActionState } from "react";

import {
  persistUserMessageAction,
  type MessageActionState,
} from "@/features/conversations/actions";
import { MAX_MESSAGE_LENGTH } from "@/features/conversations/contracts";
import { MessageSubmitButton } from "@/features/conversations/message-submit-button";

type ConversationComposerProps = {
  conversationId?: string;
};

export function ConversationComposer({ conversationId }: ConversationComposerProps) {
  const initialState: MessageActionState = {
    content: "",
    error: null,
    revision: 0,
  };
  const [state, formAction] = useActionState(persistUserMessageAction, initialState);

  return (
    <form action={formAction} className="mx-auto max-w-3xl">
      {conversationId ? (
        <input type="hidden" name="conversation_id" value={conversationId} />
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mb-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          {state.error === "invalid_input"
            ? "اكتب رسالة قبل الإرسال، وتأكد أنها ليست أطول من الحد المسموح."
            : "تعذر حفظ الرسالة. احتفظنا بالنص؛ حاول مرة أخرى."}
        </p>
      ) : null}

      <div className="rounded-[1.4rem] border border-[var(--border-strong)] bg-[var(--surface)] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
        <textarea
          key={state.revision}
          name="content"
          aria-label="رسالتك"
          placeholder="اكتب لإسلام..."
          rows={2}
          required
          maxLength={MAX_MESSAGE_LENGTH}
          defaultValue={state.content}
          className="block min-h-16 w-full resize-none bg-transparent px-3 py-2 text-sm leading-7 text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]"
        />
        <div className="flex items-center justify-between gap-3 px-1 pb-1">
          <button
            type="button"
            disabled
            aria-label="إضافة مرفق — قريباً"
            className="grid size-11 place-items-center rounded-full text-xl text-[var(--foreground-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">+</span>
          </button>
          <MessageSubmitButton />
        </div>
      </div>
    </form>
  );
}
