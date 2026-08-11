"use client";

import { useActionState } from "react";

import {
  saveBusinessDnaAction,
  type BusinessDnaActionState,
} from "@/features/business-dna/actions";
import {
  MAX_FIELD_LENGTH,
  businessDnaFieldDefinitions,
  type BusinessDnaValues,
} from "@/features/business-dna/fields";
import { BusinessDnaSubmitButton } from "@/features/business-dna/submit-button";

type BusinessDnaFormProps = {
  initialValues: BusinessDnaValues;
  saved: boolean;
};

export function BusinessDnaForm({ initialValues, saved }: BusinessDnaFormProps) {
  const initialState: BusinessDnaActionState = {
    error: null,
    revision: 0,
    values: initialValues,
  };
  const [state, formAction] = useActionState(saveBusinessDnaAction, initialState);

  return (
    <form action={formAction} className="mt-8 grid gap-6">
      {saved && state.error === null ? (
        <p
          role="status"
          className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--gold-bright)]"
        >
          تم حفظ الملف التجاري.
        </p>
      ) : null}

      {state.error === "invalid_input" ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          أحد الحقول أطول من الحد المسموح. اختصره ثم حاول مرة أخرى.
        </p>
      ) : null}

      {state.error === "save_failed" ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          تعذر حفظ الملف التجاري. احتفظنا بتعديلاتك؛ حاول مرة أخرى.
        </p>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2">
        {businessDnaFieldDefinitions.map((field) => {
          const inputClassName =
            "mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]";

          return (
            <label
              key={`${field.name}-${state.revision}`}
              className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 ${"multiline" in field && field.multiline ? "md:col-span-2" : ""}`}
            >
              <span className="block text-sm font-semibold">{field.label}</span>
              <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">
                {field.hint}
              </span>
              {"multiline" in field && field.multiline ? (
                <textarea
                  name={field.name}
                  defaultValue={state.values[field.name]}
                  maxLength={MAX_FIELD_LENGTH}
                  rows={4}
                  placeholder={"placeholder" in field ? field.placeholder : undefined}
                  className={`${inputClassName} resize-y`}
                />
              ) : (
                <input
                  type="text"
                  name={field.name}
                  defaultValue={state.values[field.name]}
                  maxLength={MAX_FIELD_LENGTH}
                  placeholder={"placeholder" in field ? field.placeholder : undefined}
                  className={inputClassName}
                />
              )}
            </label>
          );
        })}
      </section>

      <aside className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] p-5">
        <p className="text-sm font-medium">ما الذي لا يوضع هنا؟</p>
        <p className="mt-2 text-xs leading-6 text-[var(--foreground-subtle)]">
          أرقام الحملات والنتائج التي تتغير مع الوقت لا تعتبر جزءاً من Business DNA. سيتم حفظها لاحقاً كبيانات مؤرخة مرتبطة بالسياق الصحيح بدلاً من استبدالها هنا.
        </p>
      </aside>

      <div className="flex justify-end">
        <BusinessDnaSubmitButton />
      </div>
    </form>
  );
}
