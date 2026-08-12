"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  TEACH_ESLAM_ITEM_TYPES,
  TEACH_ESLAM_SEMANTIC_LAYERS,
} from "@/features/teach-eslam/core";
import {
  createVoiceTeachingDraftsAction,
  extractVoiceTeachingAction,
} from "@/features/voice-teaching/actions";
import type {
  VoiceTeachingCandidateView,
  VoiceTeachingExtractionView,
} from "@/features/voice-teaching/data";

export type VoiceTeachingWorkbenchItem = {
  transcriptionId: string;
  completedAt: string | null;
  extraction: VoiceTeachingExtractionView;
};

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

function candidateEdit(candidate: VoiceTeachingCandidateView): CandidateEdit {
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
  if (error === "not-found") return "لم يعد الـtranscript المكتمل متاحاً للاستخراج.";
  if (error === "finalize-conflict") return "انتهت محاولة أحدث قبل هذه المحاولة. تم تحديث الحالة.";
  if (error === "invalid-request") return "طلب الاستخراج غير صالح.";
  return "تعذر استخراج Teachings من الـtranscript. يمكنك إعادة المحاولة.";
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function CandidateEditor({
  candidate,
  selected,
  edit,
  onSelectedChange,
  onEditChange,
}: {
  candidate: VoiceTeachingCandidateView;
  selected: boolean;
  edit: CandidateEdit;
  onSelectedChange: (selected: boolean) => void;
  onEditChange: (next: CandidateEdit) => void;
}) {
  const materialized = Boolean(candidate.brainItemId);
  const inputClass =
    "mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold-muted)] disabled:opacity-60";

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={materialized || selected}
            disabled={materialized}
            onChange={(event) => onSelectedChange(event.target.checked)}
            className="size-4 accent-[var(--gold)]"
          />
          Candidate {candidate.ordinal}
        </label>
        {candidate.brainItemId ? (
          <Link
            href="/admin/brain?status=draft"
            className="text-xs font-semibold text-[var(--gold-bright)] underline underline-offset-4"
          >
            تم إنشاء Brain draft
          </Link>
        ) : (
          <span className="text-xs text-[var(--foreground-subtle)]">اختيار يدوي مطلوب</span>
        )}
      </div>

      <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <p className="text-xs font-semibold text-[var(--gold-muted)]">Exact source excerpt</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground-muted)]">
          {candidate.sourceExcerpt}
        </p>
      </div>

      <fieldset disabled={materialized} className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-xs font-medium text-[var(--foreground-muted)]">
          Semantic layer
          <select
            className={inputClass}
            value={edit.semantic_layer}
            onChange={(event) => onEditChange({ ...edit, semantic_layer: event.target.value })}
          >
            {TEACH_ESLAM_SEMANTIC_LAYERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)]">
          Teaching type
          <select
            className={inputClass}
            value={edit.item_type}
            onChange={(event) => onEditChange({ ...edit, item_type: event.target.value })}
          >
            {TEACH_ESLAM_ITEM_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          Title
          <input
            className={inputClass}
            value={edit.title}
            maxLength={200}
            onChange={(event) => onEditChange({ ...edit, title: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          Content
          <textarea
            className={`${inputClass} min-h-32 resize-y leading-7`}
            value={edit.content}
            maxLength={16_000}
            onChange={(event) => onEditChange({ ...edit, content: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)]">
          Priority — lower is stronger
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
          Topics — one per line or comma-separated
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={edit.topics}
            maxLength={1_500}
            onChange={(event) => onEditChange({ ...edit, topics: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          Summary — optional
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={edit.summary}
            maxLength={1_200}
            onChange={(event) => onEditChange({ ...edit, summary: event.target.value })}
          />
        </label>

        <label className="text-xs font-medium text-[var(--foreground-muted)] lg:col-span-2">
          Change note — optional
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

function TranscriptTeachingCard({ item }: { item: VoiceTeachingWorkbenchItem }) {
  const router = useRouter();
  const [isExtracting, startExtraction] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [message, setMessage] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [edits, setEdits] = useState<Record<string, CandidateEdit>>(() =>
    Object.fromEntries(item.extraction.candidates.map((candidate) => [candidate.id, candidateEdit(candidate)])),
  );

  const selectableCandidates = item.extraction.candidates.filter((candidate) => !candidate.brainItemId);
  const selectedCandidates = useMemo(
    () => selectableCandidates.filter((candidate) => selected.has(candidate.id)),
    [selectableCandidates, selected],
  );

  const runExtraction = () => {
    setMessage("");
    startExtraction(async () => {
      try {
        const result = await extractVoiceTeachingAction({ transcriptionId: item.transcriptionId });
        if (!result.ok) setMessage(extractionErrorMessage(result.error));
        else if (result.state === "processing") setMessage("هناك محاولة استخراج جارية بالفعل.");
        else setMessage("اكتمل استخراج Teachings للمراجعة.");
        router.refresh();
      } catch (error) {
        console.error("Voice teaching extraction request rejected", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        setMessage("انقطع الاتصال أثناء الاستخراج. الـtranscript محفوظ ويمكن إعادة المحاولة.");
        router.refresh();
      }
    });
  };

  const createDrafts = () => {
    if (!item.extraction.extractionId || selectedCandidates.length === 0) return;
    setMessage("");
    startSaving(async () => {
      try {
        const result = await createVoiceTeachingDraftsAction({
          extractionId: item.extraction.extractionId,
          candidates: selectedCandidates.map((candidate) => {
            const edit = edits[candidate.id] ?? candidateEdit(candidate);
            return {
              candidate_id: candidate.id,
              ...edit,
            };
          }),
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
        router.refresh();
      } catch (error) {
        console.error("Voice teaching draft creation request rejected", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        setMessage("انقطع الاتصال أثناء إنشاء المسودات. حدّث الصفحة قبل إعادة المحاولة.");
        router.refresh();
      }
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
                ? "Candidates جاهزة"
                : extractionStatus === "processing"
                  ? canExtract
                    ? "Extraction انتهت مهلتها"
                    : "Extraction جارية"
                  : extractionStatus === "failed"
                    ? "Extraction قابلة للإعادة"
                    : "لم يبدأ extraction"}
            </span>
            {item.completedAt ? (
              <span className="text-xs text-[var(--foreground-subtle)]">
                Transcript: {formatDate(item.completedAt)}
              </span>
            ) : null}
          </div>
          <p className="mt-3 break-all font-mono text-xs text-[var(--foreground-subtle)]" dir="ltr">
            {item.transcriptionId}
          </p>
          {item.extraction.model ? (
            <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
              {item.extraction.model} · attempt {item.extraction.attemptCount ?? 1}
            </p>
          ) : null}
        </div>

        {extractionStatus !== "completed" ? (
          <button
            type="button"
            disabled={!canExtract || isExtracting}
            onClick={runExtraction}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isExtracting
              ? "جارٍ استخراج Teachings…"
              : extractionStatus === "failed" || (extractionStatus === "processing" && canExtract)
                ? "إعادة استخراج Teachings"
                : !canExtract
                  ? "الاستخراج جارٍ…"
                  : "استخراج Teachings"}
          </button>
        ) : null}
      </div>

      {extractionStatus === "failed" && item.extraction.lastErrorCode ? (
        <p className="mt-3 font-mono text-xs text-[var(--foreground-subtle)]" dir="ltr">
          {item.extraction.lastErrorCode}
        </p>
      ) : null}

      {extractionStatus === "completed" ? (
        item.extraction.candidates.length === 0 ? (
          <div className="mt-5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--foreground-muted)]">
            لم يجد الاستخراج معرفة durable تستحق التحويل إلى Teach Eslam draft في هذا الـtranscript.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {item.extraction.candidates.map((candidate) => (
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
                onEditChange={(next) => {
                  setEdits((current) => ({ ...current, [candidate.id]: next }));
                }}
              />
            ))}

            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{selectedCandidates.length} محددة</p>
                <p className="mt-1 text-xs text-[var(--foreground-subtle)]">
                  الإنشاء هنا ينتج Drafts فقط. Approval وPublish يظلان في Brain Review.
                </p>
              </div>
              <button
                type="button"
                disabled={selectedCandidates.length === 0 || isSaving}
                onClick={createDrafts}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSaving ? "جارٍ إنشاء المسودات…" : "إنشاء المسودات المحددة"}
              </button>
            </div>
          </div>
        )
      ) : null}

      <p
        className="mt-4 min-h-5 text-xs leading-5 text-[var(--foreground-muted)]"
        aria-live="polite"
        role="status"
      >
        {message}
      </p>
    </article>
  );
}

export function VoiceTeachingWorkbench({ items }: { items: VoiceTeachingWorkbenchItem[] }) {
  return (
    <section className="mt-7" aria-labelledby="voice-teaching-title">
      <div className="mb-5">
        <p className="text-xs font-medium text-[var(--gold-muted)]">Voice → Teaching review</p>
        <h2 id="voice-teaching-title" className="mt-2 text-2xl font-semibold">
          استخرج وراجع ما يستحق الدخول إلى عقل إسلام
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
          الـAI يقترح candidates من الـtranscript المكتمل. راجع التصنيف والصياغة، اختر ما تريده فقط، ثم أنشئ Drafts. لا يوجد Auto-publish.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-sm text-[var(--foreground-muted)]">
          أكمل transcription واحداً على الأقل ليظهر هنا.
        </div>
      ) : (
        <div className="space-y-5">
          {items.map((item) => (
            <TranscriptTeachingCard key={item.transcriptionId} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
