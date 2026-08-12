import { publishTeachEslamDraftAction } from "@/features/teach-eslam/actions";
import { loadTeachEslamDrafts } from "@/features/teach-eslam/data";
import { TeachEslamForm } from "@/features/teach-eslam/teach-eslam-form";

type TeachEslamPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function TeachEslamPage({ searchParams }: TeachEslamPageProps) {
  const [{ status }, drafts] = await Promise.all([searchParams, loadTeachEslamDrafts()]);
  const publishStatus =
    status === "published" || status === "publish-failed" || status === "publish-invalid"
      ? status
      : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
        <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Text teaching</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight" dir="ltr">
          Teach Eslam
        </h1>
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
              تظهر هنا آخر المسودات المحفوظة حتى تظل قابلة للنشر بعد تحديث الصفحة أو العودة لاحقاً.
            </p>
          </div>

          {drafts.length ? (
            <div className="mt-5 grid gap-3">
              {drafts.map((draft) => (
                <article
                  key={draft.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:flex sm:items-center sm:justify-between sm:gap-5"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {draft.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                      {draft.semanticLayer} · {draft.itemType} · priority {draft.priority}
                    </p>
                  </div>

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
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-4 py-5 text-sm text-[var(--foreground-subtle)]">
              لا توجد مسودات محفوظة حالياً.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
