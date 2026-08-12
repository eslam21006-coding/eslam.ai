import Link from "next/link";

import { publishTeachEslamDraftAction } from "@/features/teach-eslam/actions";
import { loadTeachEslamDrafts } from "@/features/teach-eslam/data";
import { TeachEslamForm } from "@/features/teach-eslam/teach-eslam-form";

type TeachEslamPageProps = {
  searchParams: Promise<{ status?: string; draftPage?: string }>;
};

function parseDraftPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function TeachEslamPage({ searchParams }: TeachEslamPageProps) {
  const params = await searchParams;
  const draftPageNumber = parseDraftPage(params.draftPage);
  const draftPage = await loadTeachEslamDrafts(draftPageNumber);
  const publishStatus =
    params.status === "published" ||
    params.status === "publish-failed" ||
    params.status === "publish-invalid"
      ? params.status
      : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Text teaching</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight" dir="ltr">
              Teach Eslam
            </h1>
          </div>
          <Link
            href="/admin/brain?status=draft&page=1"
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
          >
            فتح مركز المراجعة
          </Link>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
          اكتب ما تريد أن يعرفه أو يطبقه Eslam.AI. كل تعليم يبدأ كمسودة ثابتة، ثم يحتاج إلى نشر صريح قبل أن يصبح جزءاً من عقل إسلام المستخدم في المحادثات.
        </p>

        <TeachEslamForm publishStatus={publishStatus} />

        <section className="mt-10 border-t border-[var(--border)] pt-8" aria-labelledby="saved-drafts-title">
          <div>
            <p className="text-xs font-medium text-[var(--gold-muted)]">Persisted drafts</p>
            <h2 id="saved-drafts-title" className="mt-2 text-xl font-semibold">
              المسودات المحفوظة
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
              المسودة الجديدة غير المعدلة يمكن نشرها مباشرة. بعد أي تعديل أو إعادة تصنيف من مركز المراجعة، تصبح المسودة جزءاً من مسار المراجعة ولا يمكن نشر نسخة قديمة منها من هنا.
            </p>
          </div>

          {draftPage.drafts.length ? (
            <div className="mt-5 grid gap-3">
              {draftPage.drafts.map((draft) => (
                <article
                  key={draft.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:flex sm:items-center sm:justify-between sm:gap-5"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {draft.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                      {draft.semanticLayer} · {draft.itemType} · priority {draft.priority} · v{draft.versionNumber}
                    </p>
                  </div>

                  {draft.directPublishEligible ? (
                    <form action={publishTeachEslamDraftAction} className="mt-3 shrink-0 sm:mt-0">
                      <input type="hidden" name="item_id" value={draft.id} />
                      <input type="hidden" name="version_number" value={draft.versionNumber} />
                      <button
                        type="submit"
                        className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-2 text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)] sm:w-auto"
                      >
                        نشر الآن
                      </button>
                    </form>
                  ) : (
                    <Link
                      href="/admin/brain?status=draft&page=1"
                      className="mt-3 min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)] sm:mt-0"
                    >
                      راجع النسخة المعدلة
                    </Link>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-4 py-5 text-sm text-[var(--foreground-subtle)]">
              لا توجد مسودات محفوظة في هذه الصفحة.
            </p>
          )}

          {draftPage.hasPreviousPage || draftPage.hasNextPage ? (
            <nav
              className="mt-5 flex items-center justify-between gap-3"
              aria-label="التنقل بين صفحات المسودات"
            >
              {draftPage.hasPreviousPage ? (
                <Link
                  href={`/admin/teach?draftPage=${draftPage.page - 1}`}
                  className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
                >
                  الأحدث
                </Link>
              ) : (
                <span />
              )}

              <span className="text-xs text-[var(--foreground-subtle)]" dir="ltr">
                Page {draftPage.page}
              </span>

              {draftPage.hasNextPage ? (
                <Link
                  href={`/admin/teach?draftPage=${draftPage.page + 1}`}
                  className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
                >
                  الأقدم
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
