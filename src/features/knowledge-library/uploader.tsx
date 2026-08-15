"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createKnowledgeUploadAction,
  deleteKnowledgeSourceAction,
  finalizeKnowledgeUploadAction,
} from "@/features/knowledge-library/actions";
import {
  defaultKnowledgeTitle,
  formatKnowledgeBytes,
  KNOWLEDGE_LIBRARY_ACCEPT,
  type KnowledgeUploadIntent,
  validateKnowledgeUploadIntent,
} from "@/features/knowledge-library/core";
import { createClient } from "@/lib/supabase/client";

type UploadItem = {
  id: string;
  file: File;
  title: string;
  status: "queued" | "uploading" | "finalizing" | "error" | "cleanup-error";
  message: string | null;
  pendingIntent: KnowledgeUploadIntent | null;
};

function validationMessage(file: File, title: string) {
  return validateKnowledgeUploadIntent({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    title,
  })
    ? null
    : "راجع اسم الملف ونوعه وحجمه وعنوانه. الصيغ المدعومة: PDF, DOCX, TXT, MD، والحد الأقصى 50 MB.";
}

/** Multi-file Knowledge Library uploader; completed work leaves this active queue automatically. */
export function KnowledgeUploader() {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patchItem = (id: string, patch: Partial<UploadItem>) => {
    if (!mounted.current) return;
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    if (!mounted.current) return;
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const selectFiles = (files: File[]) => {
    const additions = files.map((file): UploadItem => {
      const title = defaultKnowledgeTitle(file.name);
      const error = validationMessage(file, title);
      return {
        id: crypto.randomUUID(),
        file,
        title,
        status: error ? "error" : "queued",
        message: error,
        pendingIntent: null,
      };
    });
    setItems((current) => [...current, ...additions]);
    setMessage(null);
  };

  const finalizeIntent = async (item: UploadItem, intent: KnowledgeUploadIntent) => {
    patchItem(item.id, {
      status: "finalizing",
      pendingIntent: intent,
      message: "جارٍ التحقق من المصدر وإرساله إلى فهرس البحث…",
    });
    const result = await finalizeKnowledgeUploadAction({ sourceId: intent.sourceId });
    if (!mounted.current) return false;

    if (result.ok) {
      removeItem(item.id);
      router.refresh();
      return true;
    }

    if (result.error === "index-failed") {
      removeItem(item.id);
      setMessage("تم حفظ المصدر، لكن الفهرسة تحتاج إعادة محاولة من قائمة مكتبة المعرفة.");
      router.refresh();
      return true;
    }

    patchItem(item.id, {
      status: "error",
      pendingIntent: result.error === "not-found" ? null : intent,
      message:
        result.error === "verify-failed"
          ? "تم رفع الملف لكن تعذر التحقق منه. أعد إكمال الحفظ أو احذف المحاولة."
          : "تعذر إكمال حفظ المصدر. يمكنك المحاولة مرة أخرى.",
    });
    return false;
  };

  const uploadItem = async (item: UploadItem) => {
    if (validationMessage(item.file, item.title)) {
      patchItem(item.id, { status: "error", message: validationMessage(item.file, item.title) });
      return false;
    }

    if (item.pendingIntent) return finalizeIntent(item, item.pendingIntent);
    patchItem(item.id, { status: "uploading", message: "جارٍ رفع المصدر إلى التخزين الخاص…" });

    const intentResult = await createKnowledgeUploadAction({
      fileName: item.file.name,
      mimeType: item.file.type,
      sizeBytes: item.file.size,
      title: item.title,
    });
    if (!intentResult.ok) {
      patchItem(item.id, {
        status: "error",
        message:
          intentResult.error === "invalid-document"
            ? "الملف غير صالح بهذه الصيغة أو الحجم."
            : "تعذر تجهيز مساحة الرفع الخاصة. حاول مرة أخرى.",
      });
      return false;
    }

    const intent = intentResult.intent;
    patchItem(item.id, { pendingIntent: intent });
    try {
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(intent.bucket)
        .uploadToSignedUrl(intent.storagePath, intent.token, item.file, {
          contentType: intent.mimeType,
        });
      if (error) throw error;
    } catch (error) {
      console.error("Knowledge Library signed upload failed", {
        message: error instanceof Error ? error.message : "Unknown upload error",
      });
      const cleanup = await deleteKnowledgeSourceAction({ sourceId: intent.sourceId });
      patchItem(item.id, {
        status: cleanup.ok ? "error" : "cleanup-error",
        pendingIntent: cleanup.ok ? null : intent,
        message: cleanup.ok
          ? "فشل رفع الملف وتم تنظيف المحاولة. يمكنك إعادة المحاولة."
          : "فشل الرفع ولم يكتمل تنظيف المحاولة. أكمل حذف المحاولة قبل إعادة الرفع.",
      });
      return false;
    }

    return finalizeIntent(item, intent);
  };

  const uploadQueued = async () => {
    if (busy) return;
    const queued = items.filter((item) => item.status === "queued");
    if (queued.length === 0) return;
    setBusy(true);
    setMessage(null);
    let moved = 0;
    try {
      for (const item of queued) {
        if (await uploadItem(item)) moved += 1;
      }
      setMessage(
        moved === queued.length
          ? `تم نقل ${moved} ${moved === 1 ? "مصدر" : "مصادر"} إلى مكتبة المعرفة.`
          : `اكتملت الدفعة: انتقل ${moved} من ${queued.length}. راجع الملفات التي تحتاج تدخلاً.`,
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const retryItem = async (item: UploadItem) => {
    if (busy || item.status === "cleanup-error") return;
    setBusy(true);
    setMessage(null);
    try {
      await uploadItem(item);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const discardItem = async (item: UploadItem) => {
    if (busy) return;
    if (!item.pendingIntent) {
      removeItem(item.id);
      return;
    }
    setBusy(true);
    try {
      const result = await deleteKnowledgeSourceAction({ sourceId: item.pendingIntent.sourceId });
      if (result.ok) removeItem(item.id);
      else {
        patchItem(item.id, {
          status: "cleanup-error",
          message: "تعذر حذف المحاولة الآن. أعد محاولة إكمال الحذف.",
        });
      }
      router.refresh();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const queuedCount = items.filter((item) => item.status === "queued").length;

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
      <p className="text-xs font-medium text-[var(--gold-muted)]">إضافة مصادر</p>
      <h2 className="mt-2 text-2xl font-semibold">ارفع مراجع إلى مكتبة المعرفة</h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
        هذه الملفات مراجع يبحث فيها إسلام عند الحاجة. لن تتحول تلقائياً إلى تعليمات أو Brain drafts.
      </p>

      <label className="mt-6 block text-sm font-medium text-[var(--foreground-muted)]">
        الملفات
        <input
          type="file"
          multiple
          accept={KNOWLEDGE_LIBRARY_ACCEPT}
          disabled={busy}
          onChange={(event) => {
            selectFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
          className="mt-2 block w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm file:me-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--gold-soft)] file:px-3 file:py-2 file:font-semibold file:text-[var(--gold-bright)] disabled:opacity-60"
        />
      </label>

      {items.length > 0 ? (
        <div className="mt-5 grid gap-3" aria-label="مصادر المعرفة المختارة">
          {items.map((item) => (
            <article key={item.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold">{item.file.name}</p>
                  <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                    {formatKnowledgeBytes(item.file.size)}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--gold-muted)]">
                  {item.status === "queued"
                    ? "جاهز"
                    : item.status === "uploading"
                      ? "جارٍ الرفع"
                      : item.status === "finalizing"
                        ? "جارٍ الحفظ والفهرسة"
                        : item.status === "cleanup-error"
                          ? "يحتاج إكمال الحذف"
                          : "يحتاج تدخلاً"}
                </span>
              </div>

              <label className="mt-4 block text-xs font-medium text-[var(--foreground-muted)]">
                عنوان المصدر
                <input
                  value={item.title}
                  maxLength={200}
                  disabled={busy || Boolean(item.pendingIntent)}
                  onChange={(event) => {
                    const title = event.target.value;
                    patchItem(item.id, {
                      title,
                      status: validationMessage(item.file, title) ? "error" : "queued",
                      message: validationMessage(item.file, title),
                    });
                  }}
                  className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none disabled:opacity-60"
                />
              </label>

              {item.message ? <p className="mt-3 text-xs leading-6 text-[var(--foreground-muted)]">{item.message}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === "error" ? (
                  <button
                    type="button"
                    disabled={busy || Boolean(validationMessage(item.file, item.title))}
                    onClick={() => void retryItem(item)}
                    className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-3 py-2 text-xs font-semibold text-[var(--gold-bright)] disabled:opacity-50"
                  >
                    إعادة المحاولة
                  </button>
                ) : null}
                {(item.status === "queued" || item.status === "error" || item.status === "cleanup-error") ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void discardItem(item)}
                    className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground-subtle)] disabled:opacity-50"
                  >
                    {item.pendingIntent
                      ? item.status === "cleanup-error"
                        ? "إكمال حذف المحاولة"
                        : "حذف المحاولة"
                      : "إزالة من القائمة"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 py-5 text-sm text-[var(--foreground-subtle)]">
          اختر ملفاً أو عدة ملفات. بعد الحفظ ينتقل المصدر تلقائياً إلى قائمة المكتبة بالأسفل.
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || queuedCount === 0}
          onClick={() => void uploadQueued()}
          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:opacity-50"
        >
          {busy ? "جارٍ معالجة الملفات…" : `رفع المصادر الجاهزة (${queuedCount})`}
        </button>
      </div>

      {message ? (
        <p role="status" aria-live="polite" className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-7 text-[var(--foreground-muted)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
