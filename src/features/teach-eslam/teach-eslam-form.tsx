"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createTeachEslamDraftAction,
  publishTeachEslamDraftAction,
} from "@/features/teach-eslam/actions";
import {
  INITIAL_TEACH_ESLAM_ACTION_STATE,
  TEACH_ESLAM_ITEM_TYPES,
  TEACH_ESLAM_LIMITS,
  TEACH_ESLAM_SEMANTIC_LAYERS,
} from "@/features/teach-eslam/core";

function SaveDraftButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-[var(--radius-sm)] bg-[var(--gold)] px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "جارٍ حفظ المسودة..." : "حفظ كمسودة"}
    </button>
  );
}

function PublishButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "جارٍ النشر..." : "نشر الآن"}
    </button>
  );
}

type TeachEslamFormProps = {
  publishStatus?: "published" | "publish-failed" | "publish-invalid";
};

const inputClassName =
  "mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:border-[var(--gold-muted)]";

export function TeachEslamForm({ publishStatus }: TeachEslamFormProps) {
  const [state, formAction] = useActionState(
    createTeachEslamDraftAction,
    INITIAL_TEACH_ESLAM_ACTION_STATE,
  );

  return (
    <div className="mt-8 grid gap-6">
      {publishStatus === "published" ? (
        <p
          role="status"
          className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--gold-bright)]"
        >
          تم نشر التعليم. أصبح متاحاً الآن لعقل Eslam.AI في المحادثات الجديدة.
        </p>
      ) : null}

      {publishStatus === "publish-failed" || publishStatus === "publish-invalid" ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          تعذر نشر المسودة. أعد فتح Teach Eslam وأنشئ المسودة مرة أخرى إذا لزم الأمر.
        </p>
      ) : null}

      {state.error === "invalid_input" ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          راجع الحقول. العنوان والمحتوى مطلوبان، والقيم يجب أن تلتزم بالحدود المحددة.
        </p>
      ) : null}

      {state.error === "save_failed" ? (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          تعذر حفظ التعليم. لم يتم إنشاء مسودة جزئية؛ عدّل أو أعد المحاولة.
        </p>
      ) : null}

      {state.created && publishStatus !== "published" ? (
        <aside className="rounded-[var(--radius-lg)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] p-5 sm:p-6">
          <p className="text-xs font-medium text-[var(--gold-muted)]">Draft saved</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--gold-bright)]">
            {state.created.title}
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            المسودة محفوظة كنسخة ثابتة رقم 1. لن تؤثر على إجابات Eslam.AI إلا بعد النشر.
          </p>
          <form action={publishTeachEslamDraftAction} className="mt-4 flex justify-end">
            <input type="hidden" name="item_id" value={state.created.itemId} />
            <input type="hidden" name="version_number" value={state.created.versionNumber} />
            <PublishButton />
          </form>
        </aside>
      ) : null}

      <form action={formAction} className="grid gap-6">
        <section className="grid gap-5 md:grid-cols-2">
          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 md:col-span-2">
            <span className="block text-sm font-semibold">العنوان</span>
            <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">
              اسم واضح ومحدد لهذا التعليم.
            </span>
            <input
              key={`title-${state.revision}`}
              name="title"
              type="text"
              required
              maxLength={TEACH_ESLAM_LIMITS.title}
              defaultValue={state.values.title}
              placeholder="مثال: شخّص أول نقطة مكسورة قبل تحسين باقي الفانل"
              className={inputClassName}
            />
          </label>

          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 md:col-span-2">
            <span className="block text-sm font-semibold">ماذا تريد أن تعلّم إسلام؟</span>
            <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">
              اكتب القاعدة أو المبدأ أو المثال بصياغة كاملة يمكن الرجوع إليها لاحقاً.
            </span>
            <textarea
              key={`content-${state.revision}`}
              name="content"
              required
              maxLength={TEACH_ESLAM_LIMITS.content}
              rows={10}
              defaultValue={state.values.content}
              placeholder="اكتب التعليم هنا..."
              className={`${inputClassName} resize-y leading-7`}
            />
          </label>

          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <span className="block text-sm font-semibold">الطبقة</span>
            <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">
              أين ينتمي هذا التعليم داخل Eslam Brain؟
            </span>
            <select
              key={`layer-${state.revision}`}
              name="semantic_layer"
              defaultValue={state.values.semantic_layer}
              className={inputClassName}
            >
              {TEACH_ESLAM_SEMANTIC_LAYERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <span className="block text-sm font-semibold">نوع التعليم</span>
            <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">
              يساعد Eslam.AI على فهم قوة التعليم وطريقة استخدامه.
            </span>
            <select
              key={`type-${state.revision}`}
              name="item_type"
              defaultValue={state.values.item_type}
              className={inputClassName}
            >
              {TEACH_ESLAM_ITEM_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <span className="block text-sm font-semibold">الأولوية</span>
            <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">
              رقم أقل = أولوية أقوى. الافتراضي 100.
            </span>
            <input
              key={`priority-${state.revision}`}
              name="priority"
              type="number"
              min={TEACH_ESLAM_LIMITS.priorityMin}
              max={TEACH_ESLAM_LIMITS.priorityMax}
              step={1}
              defaultValue={state.values.priority}
              className={inputClassName}
            />
          </label>

          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <span className="block text-sm font-semibold">Topics</span>
            <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">
              حتى {TEACH_ESLAM_LIMITS.topics} موضوعاً، افصل بينها بفاصلة أو سطر جديد.
            </span>
            <input
              key={`topics-${state.revision}`}
              name="topics"
              type="text"
              defaultValue={state.values.topics}
              placeholder="offers, pricing, diagnosis"
              className={inputClassName}
            />
          </label>

          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 md:col-span-2">
            <span className="block text-sm font-semibold">ملخص اختياري</span>
            <textarea
              key={`summary-${state.revision}`}
              name="summary"
              maxLength={TEACH_ESLAM_LIMITS.summary}
              rows={3}
              defaultValue={state.values.summary}
              className={`${inputClassName} resize-y`}
            />
          </label>

          <label className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 md:col-span-2">
            <span className="block text-sm font-semibold">ملاحظة النسخة — اختياري</span>
            <input
              key={`change-note-${state.revision}`}
              name="change_note"
              type="text"
              maxLength={TEACH_ESLAM_LIMITS.changeNote}
              defaultValue={state.values.change_note}
              placeholder="لماذا أضفت هذا التعليم أو ما الذي يوضحه؟"
              className={inputClassName}
            />
          </label>
        </section>

        <aside className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] p-5">
          <p className="text-sm font-medium">Draft أولاً</p>
          <p className="mt-2 text-xs leading-6 text-[var(--foreground-subtle)]">
            الحفظ لا يغيّر سلوك Eslam.AI. التعليم يدخل المحادثات فقط بعد أن تضغط «نشر الآن» بشكل صريح.
          </p>
        </aside>

        <div className="flex justify-end">
          <SaveDraftButton />
        </div>
      </form>
    </div>
  );
}
