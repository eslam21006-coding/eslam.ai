"use client";

import { useFormStatus } from "react-dom";

export function MessageSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      aria-label={pending ? "جارٍ حفظ الرسالة" : "إرسال الرسالة"}
      className="grid size-11 place-items-center rounded-full bg-[var(--gold)] text-[#11100d] transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-55"
    >
      {pending ? (
        <span aria-hidden="true" className="text-xs font-semibold">•••</span>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="m5 12 14-7-4 14-3-6-7-1Z" />
        </svg>
      )}
    </button>
  );
}
