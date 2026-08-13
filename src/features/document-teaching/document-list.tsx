import Link from "next/link";

import {
  formatDocumentTeachingBytes,
} from "@/features/document-teaching/core";
import type { DocumentTeachingPage } from "@/features/document-teaching/data";

function formatUploadedAt(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function documentTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "DOCX";
  }
  if (mimeType === "text/markdown") return "MD";
  if (mimeType === "text/plain") return "TXT";
  return mimeType;
}

/** Renders immutable saved document teaching sources with deterministic pagination. */
export function DocumentTeachingList({ page }: { page: DocumentTeachingPage }) {
  return (
    <section
      className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
      aria-labelledby="document-teaching-list-title"
    >
      <div>
        <p className="text-xs font-medium text-[var(--gold-muted)]">Saved document sources</p>
        <h2 id="document-teaching-list-title" className="mt-2 text-xl font-semibold">
          الـDocuments المحفوظة
        </h2>
        <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
          كل صف هنا مصدر immutable جاهز لمرحلة Document → Teaching في Task 22. وجوده هنا لا يعني أنه دخل Brain.
        </p>
      </div>

      {page.items.length ? (
        <div className="mt-5 grid gap-3">
          {page.items.map((item) => (
            <article
              key={item.documentId}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{item.title}</h3>
                  <p className="mt-2 break-all text-sm text-[var(--foreground-muted)]">
                    {item.originalFilename}
                  </p>
                  <p className="mt-2 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                    Source {item.sourceId}
                  </p>
                </div>
                <div className="shrink-0 text-start sm:text-end">
                  <span className="inline-flex rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-[var(--gold-bright)]">
                    {documentTypeLabel(item.mimeType)}
                  </span>
                  <p className="mt-2 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                    {formatDocumentTeachingBytes(item.sizeBytes)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--foreground-subtle)]">
                    {formatUploadedAt(item.uploadedAt)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-4 py-5 text-sm text-[var(--foreground-subtle)]">
          لا توجد Documents محفوظة في هذه الصفحة بعد.
        </p>
      )}

      {page.hasPrevious || page.hasNext ? (
        <nav className="mt-5 flex items-center justify-between gap-3" aria-label="التنقل بين صفحات Documents">
          {page.hasPrevious ? (
            <Link
              href={`/admin/teach/documents?page=${page.page - 1}`}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--foreground-muted)]"
            >
              الأحدث
            </Link>
          ) : (
            <span />
          )}

          <span className="text-xs text-[var(--foreground-subtle)]" dir="ltr">
            Page {page.page}
          </span>

          {page.hasNext ? (
            <Link
              href={`/admin/teach/documents?page=${page.page + 1}`}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--foreground-muted)]"
            >
              الأقدم
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
