import Link from "next/link";

import { DocumentTeachingList } from "@/features/document-teaching/document-list";
import { DocumentTeachingUploader } from "@/features/document-teaching/document-uploader";
import { loadDocumentTeachingPage } from "@/features/document-teaching/data";
import { requireAdmin } from "@/lib/auth/admin";

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Admin document source capture: private upload and immutable teaching provenance only. */
export default async function DocumentTeachingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const authorization = await requireAdmin();
  const params = await searchParams;
  const pageNumber = parsePage(params.page);
  const documentPage = await loadDocumentTeachingPage(authorization.userId, pageNumber);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Document teaching</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight" dir="ltr">
            Documents → Teach Eslam
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
            ارفع ملفات المعرفة التي تريد استخدامها كمصادر تعليم لإسلام. في Task 21 نحفظ الـDocument ومصدره فقط؛ extraction والمراجعة إلى Teachings تأتي في Task 22.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/brain?status=draft&page=1"
            className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] px-4 py-3 text-center text-sm font-semibold text-[var(--gold-bright)]"
          >
            Brain Review
          </Link>
          <Link
            href="/admin/teach"
            className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
          >
            العودة إلى Teach Eslam
          </Link>
        </div>
      </div>

      <DocumentTeachingUploader />
      <DocumentTeachingList page={documentPage} />

      <aside className="mt-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4 text-sm leading-7 text-[var(--foreground-muted)]">
        <strong className="text-[var(--foreground)]">حدود Task 21:</strong> الملف المحفوظ يصبح Document teaching source فقط. لا يتم استخراج نص، إنشاء candidates، إنشاء Brain draft، Approval أو Publish في هذه المهمة.
      </aside>
    </div>
  );
}
