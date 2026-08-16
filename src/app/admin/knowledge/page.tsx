import Link from "next/link";

import { loadKnowledgeSourcePage } from "@/features/knowledge-library/data";
import { KnowledgeIndexAutoRefresh } from "@/features/knowledge-library/indexing-auto-refresh-client";
import { KnowledgeSourceList } from "@/features/knowledge-library/source-list";
import { KnowledgeUploader } from "@/features/knowledge-library/uploader";
import { requireAdmin } from "@/lib/auth/admin";

export const maxDuration = 300;

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Admin Knowledge Library: durable references searched on demand rather than converted into Brain teachings. */
export default async function KnowledgeLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const pageNumber = parsePage(params.page);
  const sourcePage = await loadKnowledgeSourcePage(pageNumber);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <KnowledgeIndexAutoRefresh active={sourcePage.hasIndexing} />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Knowledge Library</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">مكتبة المعرفة</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
            ارفع المراجع التي تريد من إسلام البحث فيها عند الحاجة. تبقى هذه الملفات مصادر مرجعية ولا تتحول تلقائياً إلى تعليمات داخل عقل إسلام.
          </p>
        </div>
        <Link
          href="/admin/teach/documents"
          className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground-muted)]"
        >
          فتح المستندات التعليمية
        </Link>
      </div>

      <aside className="mb-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4 text-sm leading-7 text-[var(--foreground-muted)]">
        لو الملف يمثل طريقتك أو قواعدك أو Framework تريد أن يتبناها إسلام، استخدم <strong className="text-[var(--foreground)]">المستندات التعليمية</strong>. أما الكتب والتقارير والمراجع وSOPs التي تريد الرجوع إليها فقط عند السؤال، فمكانها هنا.
      </aside>

      <KnowledgeUploader />
      <div className="mt-8">
        <KnowledgeSourceList page={sourcePage} />
      </div>
    </div>
  );
}
