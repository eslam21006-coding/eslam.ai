"use client";

import { useFormStatus } from "react-dom";

export function BusinessDnaSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold)] bg-[var(--gold)] px-6 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "جارٍ الحفظ..." : "حفظ الملف التجاري"}
    </button>
  );
}
