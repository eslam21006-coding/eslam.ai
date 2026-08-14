"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  cancelDocumentTeachingUploadAction,
  createDocumentTeachingUploadAction,
  finalizeDocumentTeachingUploadAction,
  retryQueuedDocumentTeachingCleanupsAction,
} from "@/features/document-teaching/actions";
import {
  DOCUMENT_TEACHING_ACCEPT,
  defaultDocumentTeachingTitle,
  formatDocumentTeachingBytes,
  type DocumentTeachingUploadIntent,
  validateDocumentTeachingUploadIntent,
} from "@/features/document-teaching/core";
import { createClient } from "@/lib/supabase/client";

type UploadStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "finalize-error"
  | "cleanup-error"
  | "uploaded"
  | "error";

type BatchUploadItem = {
  id: string;
  fingerprint: string;
  file: File;
  title: string;
  status: UploadStatus;
  message: string | null;
  pendingIntent: DocumentTeachingUploadIntent | null;
};

const STATUS_LABELS: Record<UploadStatus, string> = {
  queued: "جاهز للرفع",
  preparing: "جارٍ التجهيز",
  uploading: "جارٍ الرفع",
  finalizing: "جارٍ الحفظ",
  "finalize-error": "يحتاج إكمال الحفظ",
  "cleanup-error": "يحتاج تنظيف المحاولة",
  uploaded: "تم الحفظ",
  error: "تعذر الرفع",
};

function fileFingerprint(file: File) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
}

function validationMessage(file: File, title: string) {
  return validateDocumentTeachingUploadIntent({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    title,
  })
    ? null
    : "راجع اسم الملف، النوع، الحجم، وعنوان المصدر. الصيغ المدعومة: PDF, DOCX, TXT, MD، والحد الأقصى 50 MB.";
}

/** Admin batch uploader that keeps each private document upload independently recoverable. */
export function DocumentTeachingUploader() {
  const router = useRouter();
  const [items, setItems] = useState<BatchUploadItem[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    void retryQueuedDocumentTeachingCleanupsAction().then((result) => {
      if (!result.ok) {
        console.warn("Some queued document teaching cleanup is still pending", {
          cleaned: result.cleaned,
          failed: result.failed,
        });
      }
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateItem = (itemId: string, patch: Partial<BatchUploadItem>) => {
    if (!isMountedRef.current) return;
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  };

  const selectFiles = (nextFiles: File[]) => {
    if (nextFiles.length === 0) return;

    const existingFingerprints = new Set(items.map((item) => item.fingerprint));
    const additions: BatchUploadItem[] = [];
    let duplicateCount = 0;

    for (const file of nextFiles) {
      const fingerprint = fileFingerprint(file);
      if (
        existingFingerprints.has(fingerprint) ||
        additions.some((item) => item.fingerprint === fingerprint)
      ) {
        duplicateCount += 1;
        continue;
      }

      const title = defaultDocumentTeachingTitle(file.name);
      const error = validationMessage(file, title);
      additions.push({
        id: crypto.randomUUID(),
        fingerprint,
        file,
        title,
        status: error ? "error" : "queued",
        message: error,
        pendingIntent: null,
      });
    }

    if (additions.length > 0) {
      setItems((current) => [...current, ...additions]);
    }
    setBatchMessage(
      duplicateCount > 0
        ? `تم تجاهل ${duplicateCount} ${duplicateCount === 1 ? "ملف مكرر" : "ملفات مكررة"} في قائمة الرفع الحالية.`
        : null,
    );
  };

  const cleanupIntent = async (itemId: string, intent: DocumentTeachingUploadIntent) => {
    try {
      const result = await cancelDocumentTeachingUploadAction({ documentId: intent.documentId });
      if (!isMountedRef.current) return "failed" as const;
      if (!result.ok) {
        updateItem(itemId, {
          status: "cleanup-error",
          pendingIntent: intent,
          message: "تعذر تنظيف محاولة الرفع. يمكنك إعادة محاولة التنظيف من هذا الملف.",
        });
        return "failed" as const;
      }
      if (result.state === "uploaded") {
        updateItem(itemId, {
          status: "uploaded",
          pendingIntent: null,
          message: "تم حفظ الملف بالفعل كمصدر تعليم.",
        });
        router.refresh();
        return "uploaded" as const;
      }
      updateItem(itemId, { pendingIntent: null });
      return "cleaned" as const;
    } catch (error) {
      console.error("Document teaching cleanup request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      updateItem(itemId, {
        status: "cleanup-error",
        pendingIntent: intent,
        message: "تعذر الاتصال أثناء تنظيف محاولة الرفع. يمكنك إعادة المحاولة.",
      });
      return "failed" as const;
    }
  };

  const finalizeIntent = async (itemId: string, intent: DocumentTeachingUploadIntent) => {
    updateItem(itemId, {
      status: "finalizing",
      pendingIntent: intent,
      message: "جارٍ التحقق من الملف وحفظ المصدر…",
    });

    try {
      const result = await finalizeDocumentTeachingUploadAction({ documentId: intent.documentId });
      if (!isMountedRef.current) return false;
      if (!result.ok) {
        if (result.error === "not-found") {
          updateItem(itemId, {
            status: "error",
            pendingIntent: null,
            message: "انتهت محاولة الحفظ السابقة. أعد رفع الملف لبدء محاولة جديدة.",
          });
          return false;
        }
        updateItem(itemId, {
          status: "finalize-error",
          pendingIntent: intent,
          message:
            result.error === "verify-failed"
              ? "تم رفع الملف لكن تعذر التحقق من الحجم أو النوع. أعد التحقق أو نظّف المحاولة."
              : "تم رفع الملف لكن لم يكتمل حفظ المصدر. أعد محاولة إكمال الحفظ؛ لا ترفع الملف مرة ثانية.",
        });
        return false;
      }

      updateItem(itemId, {
        status: "uploaded",
        pendingIntent: null,
        message: "تم حفظ المستند كمصدر تعليم خاص، وأصبح جاهزاً لاستخراج التعليمات ومراجعتها.",
      });
      router.refresh();
      return true;
    } catch (error) {
      console.error("Document teaching finalization request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      updateItem(itemId, {
        status: "finalize-error",
        pendingIntent: intent,
        message: "انقطع الاتصال بعد رفع الملف. أعد محاولة إكمال الحفظ؛ لا ترفع الملف مرة ثانية.",
      });
      return false;
    }
  };

  const uploadItem = async (item: BatchUploadItem) => {
    const validated = validateDocumentTeachingUploadIntent({
      fileName: item.file.name,
      mimeType: item.file.type,
      sizeBytes: item.file.size,
      title: item.title,
    });
    if (!validated) {
      updateItem(item.id, {
        status: "error",
        message: validationMessage(item.file, item.title),
        pendingIntent: null,
      });
      return false;
    }

    updateItem(item.id, { status: "preparing", message: "جارٍ تجهيز مساحة الرفع الخاصة…" });

    let intentResult: Awaited<ReturnType<typeof createDocumentTeachingUploadAction>>;
    try {
      intentResult = await createDocumentTeachingUploadAction({
        fileName: item.file.name,
        mimeType: item.file.type,
        sizeBytes: item.file.size,
        title: item.title,
      });
    } catch (error) {
      console.error("Document teaching upload intent request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      updateItem(item.id, {
        status: "error",
        message: "تعذر تجهيز مساحة الرفع الخاصة. الملف ما زال على جهازك ويمكن المحاولة مرة أخرى.",
      });
      return false;
    }

    if (!intentResult.ok) {
      updateItem(item.id, {
        status: "error",
        message:
          intentResult.error === "invalid-document"
            ? "الملف غير صالح للحفظ بهذه الصيغة أو الحجم."
            : "تعذر تجهيز مساحة الرفع الخاصة. حاول مرة أخرى.",
      });
      return false;
    }

    const intent = intentResult.intent;
    updateItem(item.id, {
      status: "uploading",
      pendingIntent: intent,
      message: "جارٍ رفع الملف إلى التخزين الخاص…",
    });

    if (!isMountedRef.current) {
      void cancelDocumentTeachingUploadAction({ documentId: intent.documentId }).catch(() => undefined);
      return false;
    }

    const supabase = createClient();
    let uploadErrorMessage: string | null = null;
    try {
      const { error: uploadError } = await supabase.storage
        .from(intent.bucket)
        .uploadToSignedUrl(intent.storagePath, intent.token, item.file, {
          contentType: intent.mimeType,
          upsert: false,
        });
      uploadErrorMessage = uploadError?.message ?? null;
    } catch (error) {
      uploadErrorMessage = error instanceof Error ? error.message : "Unknown upload error";
    }

    if (uploadErrorMessage) {
      console.error("Signed document teaching upload failed", { message: uploadErrorMessage });
      const cleanupState = await cleanupIntent(item.id, intent);
      if (!isMountedRef.current) return false;
      if (cleanupState === "cleaned") {
        updateItem(item.id, {
          status: "error",
          pendingIntent: null,
          message: "فشل رفع الملف وتم تنظيف المحاولة. يمكنك إعادة رفع هذا الملف من القائمة.",
        });
      }
      return cleanupState === "uploaded";
    }

    if (!isMountedRef.current) {
      void cancelDocumentTeachingUploadAction({ documentId: intent.documentId }).catch(() => undefined);
      return false;
    }

    return finalizeIntent(item.id, intent);
  };

  const uploadQueued = async () => {
    const queued = items.filter((item) => item.status === "queued");
    if (queued.length === 0 || batchBusy) return;

    setBatchBusy(true);
    setBatchMessage(null);
    let succeeded = 0;

    for (const item of queued) {
      if (!isMountedRef.current) break;
      if (await uploadItem(item)) succeeded += 1;
    }

    if (!isMountedRef.current) return;
    setBatchBusy(false);
    setBatchMessage(
      succeeded === queued.length
        ? `تم حفظ ${succeeded} ${succeeded === 1 ? "مستند" : "مستندات"} بنجاح.`
        : `اكتمل رفع الدفعة: نجح ${succeeded} من ${queued.length}. راجع حالة كل ملف وأعد محاولة الملفات التي تحتاج تدخلاً.`,
    );
  };

  const retryUpload = async (item: BatchUploadItem) => {
    if (batchBusy || item.pendingIntent) return;
    setBatchBusy(true);
    setBatchMessage(null);
    await uploadItem(item);
    if (isMountedRef.current) setBatchBusy(false);
  };

  const retryFinalization = async (item: BatchUploadItem) => {
    if (batchBusy || !item.pendingIntent) return;
    setBatchBusy(true);
    setBatchMessage(null);
    await finalizeIntent(item.id, item.pendingIntent);
    if (isMountedRef.current) setBatchBusy(false);
  };

  const retryCleanup = async (item: BatchUploadItem) => {
    if (batchBusy || !item.pendingIntent) return;
    setBatchBusy(true);
    setBatchMessage(null);
    const cleanupState = await cleanupIntent(item.id, item.pendingIntent);
    if (cleanupState === "cleaned") {
      updateItem(item.id, {
        status: "error",
        message: "تم تنظيف محاولة الرفع. يمكنك إعادة رفع الملف.",
        pendingIntent: null,
      });
    }
    if (isMountedRef.current) setBatchBusy(false);
  };

  const discardPending = async (item: BatchUploadItem) => {
    if (batchBusy || !item.pendingIntent) return;
    setBatchBusy(true);
    setBatchMessage(null);
    const cleanupState = await cleanupIntent(item.id, item.pendingIntent);
    if (cleanupState === "cleaned" && isMountedRef.current) {
      updateItem(item.id, {
        status: "error",
        message: "تم حذف محاولة الرفع غير المكتملة. يمكنك إعادة رفع الملف.",
        pendingIntent: null,
      });
    }
    if (isMountedRef.current) setBatchBusy(false);
  };

  const queuedCount = items.filter((item) => item.status === "queued").length;
  const uploadedCount = items.filter((item) => item.status === "uploaded").length;
  const editableStatus = (status: UploadStatus) => status === "queued" || status === "error";

  return (
    <section
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
      aria-labelledby="document-teaching-uploader-title"
    >
      <div>
        <p className="text-xs font-medium text-[var(--gold-muted)]">مصادر المستندات</p>
        <h2 id="document-teaching-uploader-title" className="mt-2 text-2xl font-semibold">
          ارفع مستندات كمصادر تعليم
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
          اختر ملفاً واحداً أو عدة ملفات. يُحفظ كل مستند كمصدر خاص مستقل، ثم يمكنك استخراج التعليمات منه ومراجعتها قبل إنشاء Brain drafts. يظل كل تعليم مرتبطاً بمصدره الأصلي.
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        <label className="text-sm font-medium text-[var(--foreground-muted)]">
          المستندات
          <input
            type="file"
            multiple
            accept={DOCUMENT_TEACHING_ACCEPT}
            disabled={batchBusy}
            onChange={(event) => {
              selectFiles(Array.from(event.target.files ?? []));
              event.currentTarget.value = "";
            }}
            className="mt-2 block w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm file:me-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--gold-soft)] file:px-3 file:py-2 file:font-semibold file:text-[var(--gold-bright)] disabled:opacity-60"
          />
        </label>

        {items.length > 0 ? (
          <div className="grid gap-3" aria-label="قائمة المستندات المختارة">
            {items.map((item) => {
              const busy = ["preparing", "uploading", "finalizing"].includes(item.status);
              const canEdit = !batchBusy && editableStatus(item.status) && !item.pendingIntent;
              const errorState = ["error", "finalize-error", "cleanup-error"].includes(item.status);

              return (
                <article
                  key={item.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm font-semibold text-[var(--foreground)]">{item.file.name}</p>
                      <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                        {formatDocumentTeachingBytes(item.file.size)} · {item.file.type || "MIME غير متاح من المتصفح"}
                      </p>
                    </div>
                    <span
                      role="status"
                      className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${
                        item.status === "uploaded"
                          ? "border-[color:var(--success)]/30 text-[var(--success)]"
                          : errorState
                            ? "border-[color:var(--danger)]/30 text-[var(--danger)]"
                            : "border-[var(--border-strong)] text-[var(--gold-muted)]"
                      }`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>

                  <label className="mt-4 block text-xs font-medium text-[var(--foreground-muted)]">
                    عنوان المصدر
                    <input
                      value={item.title}
                      maxLength={200}
                      disabled={!canEdit}
                      onChange={(event) => {
                        const title = event.target.value;
                        updateItem(item.id, {
                          title,
                          status: validationMessage(item.file, title) ? "error" : "queued",
                          message: validationMessage(item.file, title),
                        });
                      }}
                      className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold-muted)] disabled:opacity-60"
                    />
                  </label>

                  {item.message ? (
                    <p
                      role={errorState ? "alert" : "status"}
                      className="mt-3 text-xs leading-6 text-[var(--foreground-muted)]"
                    >
                      {item.message}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.status === "error" && !item.pendingIntent ? (
                      <button
                        type="button"
                        disabled={batchBusy || Boolean(validationMessage(item.file, item.title))}
                        onClick={() => void retryUpload(item)}
                        className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground-muted)] disabled:opacity-50"
                      >
                        إعادة المحاولة
                      </button>
                    ) : null}

                    {item.status === "finalize-error" && item.pendingIntent ? (
                      <>
                        <button
                          type="button"
                          disabled={batchBusy}
                          onClick={() => void retryFinalization(item)}
                          className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-3 py-2 text-xs font-semibold text-[var(--gold-bright)] disabled:opacity-50"
                        >
                          إكمال الحفظ
                        </button>
                        <button
                          type="button"
                          disabled={batchBusy}
                          onClick={() => void discardPending(item)}
                          className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground-subtle)] disabled:opacity-50"
                        >
                          تنظيف المحاولة
                        </button>
                      </>
                    ) : null}

                    {item.status === "cleanup-error" && item.pendingIntent ? (
                      <button
                        type="button"
                        disabled={batchBusy}
                        onClick={() => void retryCleanup(item)}
                        className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground-muted)] disabled:opacity-50"
                      >
                        إعادة محاولة التنظيف
                      </button>
                    ) : null}

                    {(item.status === "queued" || item.status === "uploaded" || (item.status === "error" && !item.pendingIntent)) && !busy ? (
                      <button
                        type="button"
                        disabled={batchBusy}
                        onClick={() => setItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}
                        className="min-h-10 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium text-[var(--foreground-subtle)] disabled:opacity-50"
                      >
                        إزالة من القائمة
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 py-5 text-sm text-[var(--foreground-subtle)]">
            اختر الملفات التي تريد إضافتها. يمكنك اختيار عدة مستندات في نفس المرة.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={batchBusy || queuedCount === 0}
            onClick={() => void uploadQueued()}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batchBusy ? "جارٍ رفع الدفعة…" : `رفع الملفات الجاهزة (${queuedCount})`}
          </button>

          {uploadedCount > 0 && !batchBusy ? (
            <button
              type="button"
              onClick={() => setItems((current) => current.filter((item) => item.status !== "uploaded"))}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--foreground-muted)]"
            >
              إخفاء الملفات المحفوظة
            </button>
          ) : null}
        </div>

        <p className="text-xs leading-6 text-[var(--foreground-subtle)]">
          الصيغ المدعومة: PDF, DOCX, TXT, MD · الحد الأقصى 50 MB لكل ملف · التخزين Private.
        </p>

        {batchMessage ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-7 text-[var(--foreground-muted)]"
          >
            {batchMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
