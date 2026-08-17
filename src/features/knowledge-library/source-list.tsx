"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteKnowledgeSourceAction,
  finalizeKnowledgeUploadAction,
  refreshKnowledgeSourceAction,
  retryKnowledgeIndexAction,
} from "@/features/knowledge-library/actions";
import { formatKnowledgeBytes, type KnowledgeSourceStatus } from "@/features/knowledge-library/core";
import type { KnowledgeSourcePage } from "@/features/knowledge-library/data";

const STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  pending: "ينتظر إكمال الحفظ",
  indexing: "جارٍ تجهيز البحث",
  ready: "جاهز للبحث",
  failed: "تحتاج الفهرسة إعادة محاولة",
  deleting: "جارٍ الحذف",
};

type KnowledgeSourceOperationResult = {
  ok: boolean;
  error?: string;
};

export function KnowledgeSourceList({ page }: { page: KnowledgeSourcePage }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (
    sourceId: string,
    operation: () => Promise<KnowledgeSourceOperationResult>,
    failureMessage: string,
    messageByError: Record<string, string> = {},
  ) => {
    if (isPending) return;
    setPendingId(sourceId);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await operation();
        if (!result.ok) {
          setMessage((result.error && messageByError[result.error]) ?? failureMessage);
        }
        router.refresh();
      } catch (error) {
        console.error("Knowledge Library source operation failed", {
          message: error instanceof Error ? error.message : "Unknown source operation error",
        });
        setMessage(failureMessage);
      } finally {
        setPendingId(null);
      }
    });
  };

  if (page.items.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] px-5 py-7 text-sm leading-7 text-[var(--foreground-subtle)]">
        لا توجد مراجع في مكتبة المعرفة حتى الآن.
      </div>
    );
  }

  return (
    <section aria-labelledby="knowledge-sources-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--gold-muted)]">المراجع المحفوظة</p>
          <h2 id="knowledge-sources-title" className="mt-2 text-2xl font-semibold">
            مصادر مكتبة المعرفة
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
            المصدر الجاهز يمكن لإسلام البحث داخله عند الحاجة. المصدر هنا لا يصبح جزءاً من عقل إسلام تلقائياً.
          </p>
        </div>
        <span className="text-xs text-[var(--foreground-subtle)]">{page.total} مصدر</span>
      </div>

      {message ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-sm)] border border-[color:var(--danger)]/30 px-4 py-3 text-sm text-[var(--danger)]">
          {message}
        </p>
      ) : null}

      <div className="grid gap-3">
        {page.items.map((source) => {
          const itemBusy = isPending && pendingId === source.id;
          const statusTone =
            source.status === "ready"
              ? "text-[var(--success)] border-[color:var(--success)]/30"
              : source.status === "failed"
                ? "text-[var(--danger)] border-[color:var(--danger)]/30"
                : "text-[var(--gold-muted)] border-[var(--border-strong)]";

          return (
            <article key={source.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{source.title}</h3>
                  <p className="mt-1 break-all text-xs text-[var(--foreground-subtle)]">{source.originalFilename}</p>
                  <p className="mt-2 text-xs text-[var(--foreground-subtle)]">
                    {source.sizeBytes ? formatKnowledgeBytes(source.sizeBytes) : "لم يكتمل التحقق من الحجم"}
                    {" · "}
                    {new Intl.DateTimeFormat("ar-EG", {
                      dateStyle: "medium",
                      timeZone: "Africa/Cairo",
                    }).format(new Date(source.createdAt))}
                  </p>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone}`}>
                  {STATUS_LABELS[source.status]}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {source.status === "pending" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        source.id,
                        () => finalizeKnowledgeUploadAction({ sourceId: source.id }),
                        "تعذر إكمال حفظ المصدر. إذا لم يعد الملف موجوداً يمكنك حذف المحاولة وإعادة الرفع.",
                        {
                          "index-failed":
                            "تم حفظ المصدر، لكن الفهرسة تحتاج إعادة محاولة من هذه القائمة.",
                        },
                      )
                    }
                    className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-3 py-2 text-xs font-semibold text-[var(--gold-bright)] disabled:opacity-50"
                  >
                    {itemBusy ? "جارٍ الإكمال…" : "إكمال الحفظ"}
                  </button>
                ) : null}

                {source.status === "indexing" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        source.id,
                        () => refreshKnowledgeSourceAction({ sourceId: source.id }),
                        "تعذر تحديث حالة الفهرسة الآن.",
                      )
                    }
                    className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-3 py-2 text-xs font-semibold text-[var(--gold-bright)] disabled:opacity-50"
                  >
                    {itemBusy ? "جارٍ التحديث…" : "تحديث الحالة"}
                  </button>
                ) : null}

                {source.status === "failed" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        source.id,
                        () => retryKnowledgeIndexAction({ sourceId: source.id }),
                        "تعذر بدء إعادة الفهرسة الآن.",
                      )
                    }
                    className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-3 py-2 text-xs font-semibold text-[var(--gold-bright)] disabled:opacity-50"
                  >
                    {itemBusy ? "جارٍ المحاولة…" : "إعادة الفهرسة"}
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (source.status !== "deleting" && !window.confirm("حذف هذا المصدر من مكتبة المعرفة؟")) return;
                    run(
                      source.id,
                      () => deleteKnowledgeSourceAction({ sourceId: source.id }),
                      "لم يكتمل حذف المصدر. إذا كانت الفهرسة ما زالت نشطة، انتظر قليلاً ثم أعد المحاولة.",
                    );
                  }}
                  className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground-subtle)] disabled:opacity-50"
                >
                  {source.status === "deleting"
                    ? itemBusy
                      ? "جارٍ إكمال الحذف…"
                      : "إكمال الحذف"
                    : itemBusy
                      ? "جارٍ الحذف…"
                      : "حذف المصدر"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {page.totalPages > 1 ? (
        <nav className="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="صفحات مكتبة المعرفة">
          {page.page > 1 ? (
            <Link href={`/admin/knowledge?page=${page.page - 1}`} className="rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-2.5 text-[var(--foreground-muted)]">
              الصفحة السابقة
            </Link>
          ) : <span />}
          <span className="text-xs text-[var(--foreground-subtle)]">صفحة {page.page} من {page.totalPages}</span>
          {page.page < page.totalPages ? (
            <Link href={`/admin/knowledge?page=${page.page + 1}`} className="rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-2.5 text-[var(--foreground-muted)]">
              الصفحة التالية
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </section>
  );
}
