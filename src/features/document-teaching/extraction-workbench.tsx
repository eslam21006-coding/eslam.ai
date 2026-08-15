"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createDocumentTeachingDraftsAction,
  extractDocumentTeachingAction,
} from "@/features/document-teaching/extraction-actions";
import type {
  DocumentTeachingCandidateView,
  DocumentTeachingExtractionView,
} from "@/features/document-teaching/extraction-data";
import {
  TEACH_ESLAM_ITEM_TYPES,
  TEACH_ESLAM_SEMANTIC_LAYERS,
} from "@/features/teach-eslam/core";

type CandidateEdit = {
  semantic_layer: string;
  item_type: string;
  priority: string;
  title: string;
  content: string;
  summary: string;
  topics: string;
  change_note: string;
};

export type DocumentTeachingWorkbenchItem = {
  documentId: string;
  title: string;
  originalFilename: string;
  extraction: DocumentTeachingExtractionView;
};

function candidateEdit(candidate: DocumentTeachingCandidateView): CandidateEdit {
  return {
    semantic_layer: candidate.semanticLayer,
    item_type: candidate.itemType,
    priority: String(candidate.priority),
    title: candidate.title,
    content: candidate.content,
    summary: candidate.summary ?? "",
    topics: candidate.topics.join("\n"),
    change_note: "",
  };
}

function extractionErrorMessage(error: string) {
  if (error === "not-found") return "لم يعد مصدر المستند متاحاً للاستخراج.";
  if (error === "download-failed") return "تعذر تحميل المستند الخاص. يمكنك إعادة المحاولة.";
  if (error === "finalize-conflict") return "اكتملت محاولة أحدث وتم تحديث الحالة.";
  if (error === "invalid-request") return "تعذر بدء الاستخراج بهذه البيانات.";
  return "تعذر استخراج التعليمات من المستند. يمكنك إعادة المحاولة.";
}

function CandidateEditor({
  candidate,
  selected,
  edit,
  onSelectedChange,
  onEditChange,
}: {
  candidate: DocumentTeachingCandidateView;
  selected: boolean;
  edit: CandidateEdit;
  onSelectedChange: (selected: boolean) => void;
  onEditChange: (next: CandidateEdit) => void;
}) {
  const inputClass =
    "mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold-muted)] disabled:opacity-60";

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
            className="size-4 accent-[var(--gold)]"
          />
          تعليم مقترح {candidate.ordinal}
        </label>
        <span className="text-xs text-[var(--foreground-subtle)]">اختره إذا كان يستحق الحفظ</span>
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--gold-muted)]">موضع المصدر</p>
        <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="auto">
          {candidate.sourceLocator}
        </p>
        <p className="mt-3 text-xs font-semibold text-[var(--gold-muted)]">المقتطف الأصلي</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground-muted)]" dir="auto">
          {candidate.sourceExcerpt}
        </p>
      </div>

      <fieldset className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-xs font-medium text-[var(--foreground-muted)]">
          الطبقة
          <select
            className={inputClass}
            value={edit.semantic_layer}
            onChange={(event) => onEditChange({ ...edit, semantic_layer: event.target.value })}
          >
            {TEACH_ESLAM_SEMANTIC_LAYERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)]">
          نوع التعليم
          <select
            className={inputClass}
            value={edit.item_type}
            onChange={(event) => onEditChange({ ...edit, item_type: event.target.value })}
          >
            {TEACH_ESLAM_ITEM_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          العنوان
          <input
            className={inputClass}
            value={edit.title}
            maxLength={200}
            onChange={(event) => onEditChange({ ...edit, title: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          المحتوى
          <textarea
            className={`${inputClass} min-h-32 resize-y leading-7`}
            value={edit.content}
            maxLength={16_000}
            onChange={(event) => onEditChange({ ...edit, content: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)]">
          الأولوية — الرقم الأقل أقوى
          <input
            className={inputClass}
            type="number"
            min={0}
            max={1000}
            step={1}
            value={edit.priority}
            onChange={(event) => onEditChange({ ...edit, priority: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)]">
          Topics — موضوع واحد في كل سطر
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={edit.topics}
            maxLength={1_500}
            onChange={(event) => onEditChange({ ...edit, topics: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          الملخص — اختياري
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={edit.summary}
            maxLength={1_200}
            onChange={(event) => onEditChange({ ...edit, summary: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          ملاحظة النسخة — اختياري
          <input
            className={inputClass}
            value={edit.change_note}
            maxLength={1_000}
            onChange={(event) => onEditChange({ ...edit, change_note: event.target.value })}
          />
        </label>
      </fieldset>
    </article>
  );
}

function DocumentTeachingCard({ item }: { item: DocumentTeachingWorkbenchItem }) {
  const router = useRouter();
  const [isExtracting, startExtraction] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [edits, setEdits] = useState<Record<string, CandidateEdit>>(() =>
    Object.fromEntries(item.extraction.candidates.map((candidate) => [candidate.id, candidateEdit(candidate)])),
  );

  const selectableCandidates = useMemo(
    () => item.extraction.candidates.filter((candidate) => !candidate.brainItemId),
    [item.extraction.candidates],
  );
  const selectedCandidates = useMemo(
    () => selectableCandidates.filter((candidate) => selected.has(candidate.id)),
    [selectableCandidates, selected],
  );
  const allSelected =
    selectableCandidates.length > 0 && selectedCandidates.length === selectableCandidates.length;

  const runExtraction = () => {
    setMessage("");
    startExtraction(async () => {
      try {
        const result = await extractDocumentTeachingAction({ documentId: item.documentId });
        if (!result.ok) setMessage(extractionErrorMessage(result.error));
        else if (result.state === "processing") setMessage("الاستخراج جارٍ بالفعل لهذا المستند.");
        else setMessage("اكتمل استخراج التعليمات وأصبحت جاهزة للمراجعة.");
      } catch (error) {
        console.error("Document teaching extraction request rejected", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        setMessage("انقطع الاتصال أثناء الاستخراج. المستند محفوظ ويمكن إعادة المحاولة.");
      }
      router.refresh();
    });
  };

  const createDrafts = () => {
    if (!item.extraction.extractionId || selectedCandidates.length === 0) return;
    setMessage("");
    startSaving(async () => {
      try {
        const result = await createDocumentTeachingDraftsAction({
          extractionId: item.extraction.extractionId,
          candidates: selectedCandidates.map((candidate) => ({
            candidate_id: candidate.id,
            ...(edits[candidate.id] ?? candidateEdit(candidate)),
          })),
        });
        if (!result.ok) {
          setMessage(
            result.error === "invalid-request"
              ? "راجع الحقول المحددة؛ توجد قيمة غير صالحة."
              : "تعذر إنشاء Brain drafts المحددة. لم يتم نشر أي شيء.",
          );
        } else {
          setMessage(`تم إنشاء ${result.created.length} Brain draft للمراجعة. لم يتم نشرها.`);
          setSelected(new Set());
        }
      } catch (error) {
        console.error("Document teaching draft creation request rejected", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        setMessage("انقطع الاتصال أثناء إنشاء المسودات. حدّث الصفحة قبل إعادة المحاولة.");
      }
      router.refresh();
    });
  };

  const extractionStatus = item.extraction.status;
  const canExtract = item.extraction.canExtract;

  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-muted)]">
              {extractionStatus === "completed"
                ? "التعليمات جاهزة للمراجعة"
                : extractionStatus === "processing"
                  ? canExtract ? "انتهت مهلة الاستخراج — يمكن إعادته" : "جارٍ الاستخراج"
                  : extractionStatus === "failed" ? "تعذر الاستخراج — يمكن إعادته" : "جاهز للاستخراج"}
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
          <p className="mt-1 break-all text-xs text-[var(--foreground-subtle)]" dir="auto">
            {item.originalFilename}
          </p>
        </div>

        {extractionStatus !== "completed" ? (
          <button
            type="button"
            disabled={!canExtract || isExtracting}
            onClick={runExtraction}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isExtracting
              ? "جارٍ استخراج التعليمات…"
              : extractionStatus === "failed" || (extractionStatus === "processing" && canExtract)
                ? "إعادة استخراج التعليمات"
                : !canExtract ? "الاستخراج جارٍ…" : "استخراج التعليمات"}
          </button>
        ) : null}
      </div>

      {extractionStatus === "completed" && selectableCandidates.length > 0 ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--foreground-subtle)]">
              {selectedCandidates.length} من {selectableCandidates.length} محددة
            </p>
            <button
              type="button"
              onClick={() =>
                setSelected(
                  allSelected
                    ? new Set()
                    : new Set(selectableCandidates.map((candidate) => candidate.id)),
                )
              }
              className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--foreground-muted)]"
            >
              {allSelected ? "إلغاء تحديد الكل" : `تحديد الكل (${selectableCandidates.length})`}
            </button>
          </div>

          {selectableCandidates.map((candidate) => (
            <CandidateEditor
              key={candidate.id}
              candidate={candidate}
              selected={selected.has(candidate.id)}
              edit={edits[candidate.id] ?? candidateEdit(candidate)}
              onSelectedChange={(checked) => {
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(candidate.id);
                  else next.delete(candidate.id);
                  return next;
                });
              }}
              onEditChange={(next) => setEdits((current) => ({ ...current, [candidate.id]: next }))}
            />
          ))}

          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{selectedCandidates.length} محددة</p>
              <p className="mt-1 text-xs text-[var(--foreground-subtle)]">
                بعد إنشاء Brain drafts ستختفي هذه التعليمات من قائمة العمل هنا وتنتقل إلى عقل إسلام.
              </p>
            </div>
            <button
              type="button"
              disabled={selectedCandidates.length === 0 || isSaving}
              onClick={createDrafts}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSaving ? "جارٍ إنشاء المسودات…" : "إنشاء Brain drafts المحددة"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          {message}
        </p>
      ) : null}
    </article>
  );
}

/** Review surface for Document → Teaching extraction and explicit Brain-draft materialization. */
export function DocumentTeachingExtractionWorkbench({
  items,
}: {
  items: DocumentTeachingWorkbenchItem[];
}) {
  const actionableItems = items.filter(
    (item) =>
      item.extraction.status !== "completed" ||
      item.extraction.candidates.some((candidate) => !candidate.brainItemId),
  );

  if (actionableItems.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="document-teaching-extraction-title">
      <div>
        <p className="text-xs font-medium text-[var(--gold-muted)]">Document → Teaching</p>
        <h2 id="document-teaching-extraction-title" className="mt-2 text-xl font-semibold">
          استخراج ومراجعة التعليمات
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
          تعرض هذه القائمة ما يزال يحتاج قراراً فقط. بعد تحويل التعليم إلى Brain draft يخرج من هنا تلقائياً.
        </p>
      </div>
      <div className="mt-5 space-y-5">
        {actionableItems.map((item) => <DocumentTeachingCard key={item.documentId} item={item} />)}
      </div>
    </section>
  );
}
