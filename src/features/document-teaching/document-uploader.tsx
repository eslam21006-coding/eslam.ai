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
  DOCUMENT_TEACHING_MAX_BYTES,
  defaultDocumentTeachingTitle,
  formatDocumentTeachingBytes,
  type DocumentTeachingUploadIntent,
  validateDocumentTeachingUploadIntent,
} from "@/features/document-teaching/core";
import { createClient } from "@/lib/supabase/client";

type UploadStatus =
  | "idle"
  | "uploading"
  | "finalize-error"
  | "cleanup-error"
  | "uploaded"
  | "error";

/** Admin browser uploader that sends a validated document directly to a signed private Storage path. */
export function DocumentTeachingUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<DocumentTeachingUploadIntent | null>(null);
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

  const reset = () => {
    setFile(null);
    setTitle("");
    setPendingIntent(null);
    setStatus("idle");
    setMessage(null);
  };

  const selectFile = (nextFile: File | null) => {
    setMessage(null);
    setStatus("idle");
    setFile(nextFile);
    setPendingIntent(null);
    setTitle(nextFile ? defaultDocumentTeachingTitle(nextFile.name) : "");

    if (nextFile && nextFile.size > DOCUMENT_TEACHING_MAX_BYTES) {
      setStatus("error");
      setMessage("حجم الملف أكبر من 50 MB. اختر ملفاً أصغر قبل الحفظ.");
    }
  };

  const cleanupIntent = async (intent: DocumentTeachingUploadIntent) => {
    try {
      const result = await cancelDocumentTeachingUploadAction({ documentId: intent.documentId });
      if (!isMountedRef.current) return false;
      if (!result.ok) {
        setStatus("cleanup-error");
        setPendingIntent(intent);
        setMessage("تعذر تنظيف محاولة الرفع. احتفظنا بمرجعها؛ أعد محاولة التنظيف.");
        return false;
      }
      if (result.state === "uploaded") {
        setPendingIntent(null);
        setStatus("uploaded");
        setMessage("الملف كان قد تم تثبيته بالفعل كمصدر Document. تم تحديث القائمة.");
        router.refresh();
        return false;
      }
      setPendingIntent(null);
      return true;
    } catch (error) {
      console.error("Document teaching cleanup request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      if (!isMountedRef.current) return false;
      setStatus("cleanup-error");
      setPendingIntent(intent);
      setMessage("تعذر الاتصال أثناء تنظيف محاولة الرفع. أعد محاولة التنظيف.");
      return false;
    }
  };

  const finalizeIntent = async (intent: DocumentTeachingUploadIntent) => {
    try {
      const result = await finalizeDocumentTeachingUploadAction({ documentId: intent.documentId });
      if (!isMountedRef.current) return;
      if (!result.ok) {
        if (result.error === "not-found") {
          setPendingIntent(null);
          setStatus("error");
          setMessage("انتهت محاولة الحفظ السابقة. اختر الملف من جديد لبدء محاولة رفع جديدة.");
          return;
        }
        setPendingIntent(intent);
        setStatus("finalize-error");
        setMessage(
          result.error === "verify-failed"
            ? "تم رفع الملف لكن فشل التحقق من الحجم أو النوع. يمكنك إعادة التحقق أو حذف محاولة الرفع."
            : "تم رفع الملف لكن لم يكتمل تسجيل المصدر. الملف محفوظ ويمكن إعادة محاولة التثبيت.",
        );
        return;
      }

      setPendingIntent(null);
      setStatus("uploaded");
      setMessage("تم حفظ الـDocument كمصدر Teaching خاص. لم يتم إنشاء أو نشر أي Brain content.");
      setFile(null);
      setTitle("");
      router.refresh();
    } catch (error) {
      console.error("Document teaching finalization request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      if (!isMountedRef.current) return;
      setPendingIntent(intent);
      setStatus("finalize-error");
      setMessage("انقطع الاتصال بعد رفع الملف. أعد محاولة تثبيت المصدر؛ لا ترفع الملف مرة ثانية.");
    }
  };

  const upload = async () => {
    if (!file) {
      setStatus("error");
      setMessage("اختر Document أولاً.");
      return;
    }

    const validated = validateDocumentTeachingUploadIntent({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      title,
    });
    if (!validated) {
      setStatus("error");
      setMessage("راجع اسم الملف، النوع، الحجم، وعنوان المصدر. الصيغ المدعومة: PDF, DOCX, TXT, MD.");
      return;
    }

    setStatus("uploading");
    setMessage(null);

    let intentResult: Awaited<ReturnType<typeof createDocumentTeachingUploadAction>>;
    try {
      intentResult = await createDocumentTeachingUploadAction({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        title,
      });
    } catch (error) {
      console.error("Document teaching upload intent request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      if (!isMountedRef.current) return;
      setStatus("error");
      setMessage("تعذر تجهيز مساحة الرفع الخاصة. الملف ما زال على جهازك ويمكن المحاولة مرة أخرى.");
      return;
    }

    if (!intentResult.ok) {
      if (!isMountedRef.current) return;
      setStatus("error");
      setMessage(
        intentResult.error === "invalid-document"
          ? "الملف غير صالح للحفظ بهذه الصيغة أو الحجم."
          : "تعذر تجهيز مساحة الرفع الخاصة. حاول مرة أخرى.",
      );
      return;
    }

    const intent = intentResult.intent;
    setPendingIntent(intent);
    if (!isMountedRef.current) {
      void cancelDocumentTeachingUploadAction({ documentId: intent.documentId }).catch(() => undefined);
      return;
    }

    const supabase = createClient();
    let uploadErrorMessage: string | null = null;
    try {
      const { error: uploadError } = await supabase.storage
        .from(intent.bucket)
        .uploadToSignedUrl(intent.storagePath, intent.token, file, {
          contentType: intent.mimeType,
          upsert: false,
        });
      uploadErrorMessage = uploadError?.message ?? null;
    } catch (error) {
      uploadErrorMessage = error instanceof Error ? error.message : "Unknown upload error";
    }

    if (uploadErrorMessage) {
      console.error("Signed document teaching upload failed", { message: uploadErrorMessage });
      const cleaned = await cleanupIntent(intent);
      if (!isMountedRef.current) return;
      if (cleaned) {
        setStatus("error");
        setMessage("فشل رفع الملف وتم تنظيف المحاولة. الملف المحلي ما زال موجوداً ويمكنك المحاولة مرة أخرى.");
      }
      return;
    }

    if (!isMountedRef.current) {
      void cancelDocumentTeachingUploadAction({ documentId: intent.documentId }).catch(() => undefined);
      return;
    }

    await finalizeIntent(intent);
  };

  const retryFinalization = async () => {
    if (!pendingIntent) return;
    setStatus("uploading");
    setMessage("يتم التحقق من الملف وإكمال تسجيل المصدر…");
    await finalizeIntent(pendingIntent);
  };

  const retryCleanup = async () => {
    if (!pendingIntent) return;
    setStatus("uploading");
    setMessage("جارٍ تنظيف محاولة الرفع…");
    const cleaned = await cleanupIntent(pendingIntent);
    if (cleaned && isMountedRef.current) {
      setStatus("idle");
      setMessage("تم تنظيف محاولة الرفع. يمكنك المحاولة من جديد بالملف المحلي.");
    }
  };

  const discardPending = async () => {
    if (!pendingIntent) {
      reset();
      return;
    }
    setStatus("uploading");
    setMessage("جارٍ حذف محاولة الرفع غير المكتملة…");
    const cleaned = await cleanupIntent(pendingIntent);
    if (cleaned && isMountedRef.current) reset();
  };

  const busy = status === "uploading";
  const canStartUpload = Boolean(file) && !busy && !pendingIntent;

  return (
    <section
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
      aria-labelledby="document-teaching-uploader-title"
    >
      <div>
        <p className="text-xs font-medium text-[var(--gold-muted)]">Private document source</p>
        <h2 id="document-teaching-uploader-title" className="mt-2 text-2xl font-semibold">
          ارفع Document لتعليم Eslam.AI لاحقاً
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)]">
          الملف يُحفظ الآن كمصدر فقط. Task 22 سيستخرج منه Teachings قابلة للمراجعة؛ لا يتم إنشاء Brain draft أو Publish في هذه الخطوة.
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        <label className="text-sm font-medium text-[var(--foreground-muted)]">
          Document
          <input
            type="file"
            accept={DOCUMENT_TEACHING_ACCEPT}
            disabled={busy || Boolean(pendingIntent)}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm file:me-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--gold-soft)] file:px-3 file:py-2 file:font-semibold file:text-[var(--gold-bright)] disabled:opacity-60"
          />
        </label>

        <label className="text-sm font-medium text-[var(--foreground-muted)]">
          Source title
          <input
            value={title}
            maxLength={200}
            disabled={busy || Boolean(pendingIntent)}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثال: High-Ticket Offer Framework"
            className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--gold-muted)] disabled:opacity-60"
          />
        </label>

        {file ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm">
            <p className="break-all font-medium text-[var(--foreground)]">{file.name}</p>
            <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
              {formatDocumentTeachingBytes(file.size)} · {file.type || "browser MIME unavailable"}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canStartUpload}
            onClick={() => void upload()}
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "جارٍ الحفظ…" : "حفظ Document source"}
          </button>

          {status === "finalize-error" && pendingIntent ? (
            <>
              <button
                type="button"
                onClick={() => void retryFinalization()}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--foreground-muted)]"
              >
                إعادة التحقق والتثبيت
              </button>
              <button
                type="button"
                onClick={() => void discardPending()}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--foreground-subtle)]"
              >
                حذف محاولة الرفع
              </button>
            </>
          ) : null}

          {status === "cleanup-error" && pendingIntent ? (
            <button
              type="button"
              onClick={() => void retryCleanup()}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--foreground-muted)]"
            >
              إعادة محاولة التنظيف
            </button>
          ) : null}

          {status === "uploaded" ? (
            <button
              type="button"
              onClick={reset}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--foreground-muted)]"
            >
              رفع Document آخر
            </button>
          ) : null}
        </div>

        <p className="text-xs leading-6 text-[var(--foreground-subtle)]">
          الصيغ الحالية: PDF, DOCX, TXT, MD · الحد الأقصى 50 MB · التخزين Private.
        </p>

        {message ? (
          <p
            role={status === "error" || status === "cleanup-error" || status === "finalize-error" ? "alert" : "status"}
            aria-live="polite"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-7 text-[var(--foreground-muted)]"
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
