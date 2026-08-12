import Link from "next/link";

import { TEACH_ESLAM_ITEM_TYPES, TEACH_ESLAM_SEMANTIC_LAYERS } from "@/features/teach-eslam/core";
import {
  approveTeachingAction,
  archiveTeachingAction,
  bulkApproveTeachingsAction,
  editTeachingDraftAction,
  publishTeachingAction,
} from "@/features/teaching-review/actions";
import {
  parseTeachingReviewPage,
  parseTeachingReviewStatus,
  TEACHING_REVIEW_STATUSES,
  type TeachingLifecycleStatus,
} from "@/features/teaching-review/core";
import { loadTeachingReviewPage, type TeachingReviewSource } from "@/features/teaching-review/data";
import type { Json } from "@/types/database";

type BrainReviewPageProps = {
  searchParams: Promise<{
    status?: string;
    page?: string;
    notice?: string;
    count?: string;
    version?: string;
  }>;
};

const statusLabels: Record<TeachingLifecycleStatus, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  published: "منشورة",
  archived: "مؤرشفة",
};

const sourceTypeLabels: Record<string, string> = {
  manual_text: "نص يدوي",
  voice: "تسجيل صوتي",
  document: "مستند",
  legacy: "مصدر قديم",
};

function readJsonString(value: Json, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function noticeText(notice: string | undefined, count?: string, version?: string) {
  switch (notice) {
    case "edited":
      return `تم حفظ التعديل كنسخة جديدة${version ? ` v${version}` : ""} بدون تغيير النسخ السابقة.`;
    case "approved":
      return "تم اعتماد النسخة الحالية. يمكن نشرها الآن لتدخل في عقل Eslam.AI الفعّال.";
    case "published":
      return "تم نشر النسخة المعتمدة وأصبحت مؤهلة للاستخدام في المحادثات الجديدة.";
    case "archived":
      return "تمت الأرشفة. المحتوى المؤرشف لا يدخل في استرجاع Brain.";
    case "bulk-approved":
      return `تم اعتماد ${count ?? "المحدد"} من التعليمات بنجاح.`;
    case "edit-invalid":
    case "invalid-request":
    case "bulk-invalid":
      return "الطلب غير صالح. راجع البيانات المحددة ثم حاول مرة أخرى.";
    case "edit-failed":
    case "approve-failed":
    case "publish-failed":
    case "archive-failed":
    case "bulk-failed":
      return "لم يكتمل الإجراء لأن حالة التعليم أو نسخته تغيّرت، أو حدث خطأ أثناء الحفظ.";
    default:
      return null;
  }
}

function SourcePreview({ source }: { source: TeachingReviewSource }) {
  const entrypoint = readJsonString(source.metadata, "entrypoint");
  const captureMode = readJsonString(source.metadata, "capture_mode");
  const locatorKind = readJsonString(source.locator, "kind");

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-semibold text-[var(--gold-muted)]">
          {sourceTypeLabels[source.type] ?? source.type}
        </span>
        <span className="text-xs text-[var(--foreground-subtle)]">{source.title}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
        {entrypoint ? <span>entrypoint: {entrypoint}</span> : null}
        {captureMode ? <span>mode: {captureMode}</span> : null}
        {locatorKind ? <span>locator: {locatorKind}</span> : null}
      </div>
      {source.uri ? (
        <p className="mt-2 break-all text-xs text-[var(--foreground-muted)]" dir="ltr">
          {source.uri}
        </p>
      ) : null}
    </div>
  );
}

function HiddenReturnFields({ status, page }: { status: string; page: number }) {
  return (
    <>
      <input type="hidden" name="return_status" value={status} />
      <input type="hidden" name="return_page" value={page} />
    </>
  );
}

export default async function BrainReviewPage({ searchParams }: BrainReviewPageProps) {
  const params = await searchParams;
  const status = parseTeachingReviewStatus(params.status);
  const page = parseTeachingReviewPage(params.page);
  const reviewPage = await loadTeachingReviewPage(status, page);
  const notice = noticeText(params.notice, params.count, params.version);
  const draftItemsOnPage = reviewPage.items.filter((item) => item.status === "draft");
  const totalCount = Object.values(reviewPage.counts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Teaching review</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">عقل إسلام</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
              راجع ما تم تعليمه لإسلام، افحص المصدر، عدّل المسودة بنسخة جديدة غير قابلة لتغيير الماضي، ثم اعتمدها وانشرها بشكل صريح.
            </p>
          </div>
          <Link
            href="/admin/teach"
            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-center text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
          >
            + Teach Eslam
          </Link>
        </div>

        {notice ? (
          <div
            className="mt-6 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-6 text-[var(--foreground-muted)]"
            role="status"
          >
            {notice}
          </div>
        ) : null}

        <nav className="mt-7 flex flex-wrap gap-2" aria-label="فلترة حالة التعليمات">
          {TEACHING_REVIEW_STATUSES.map((option) => {
            const active = option.value === status;
            const count =
              option.value === "all"
                ? totalCount
                : reviewPage.counts[option.value as TeachingLifecycleStatus];
            return (
              <Link
                key={option.value}
                href={`/admin/brain?status=${option.value}&page=1`}
                aria-current={active ? "page" : undefined}
                className={`min-h-11 rounded-full border px-4 py-2.5 text-sm transition ${
                  active
                    ? "border-[var(--gold-muted)] bg-[var(--gold-soft)] text-[var(--gold-bright)]"
                    : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {option.label} <span dir="ltr">({count})</span>
              </Link>
            );
          })}
        </nav>

        {draftItemsOnPage.length ? (
          <form
            id="bulk-approve-form"
            action={bulkApproveTeachingsAction}
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
          >
            <HiddenReturnFields status={status} page={page} />
            <p className="text-xs leading-5 text-[var(--foreground-subtle)]">
              اختر المسودات من القائمة ثم اعتمدها دفعة واحدة. الحد الأقصى 50 تعليماً في العملية.
            </p>
            <button
              type="submit"
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] px-4 py-2 text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
            >
              اعتماد المحدد
            </button>
          </form>
        ) : null}

        <div className="mt-6 grid gap-5">
          {reviewPage.items.map((item) => {
            const version = item.latestVersion;
            const canEdit = item.status === "draft";
            const canApprove = item.status === "draft";
            const canPublish =
              item.status === "approved" && item.approvedVersionNumber === version.versionNumber;
            const canArchive = item.status !== "archived";

            return (
              <article
                key={item.id}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {canApprove ? (
                        <input
                          type="checkbox"
                          name="item_id"
                          value={item.id}
                          form="bulk-approve-form"
                          aria-label={`تحديد ${version.title} للاعتماد الجماعي`}
                          className="h-5 w-5 accent-[var(--gold-muted)]"
                        />
                      ) : null}
                      <span className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground-muted)]">
                        {statusLabels[item.status]}
                      </span>
                      <span className="text-xs text-[var(--foreground-subtle)]" dir="ltr">
                        v{version.versionNumber}
                      </span>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold leading-8 text-[var(--foreground)]">
                      {version.title}
                    </h2>
                    <p className="mt-2 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                      {item.semanticLayer} · {item.itemType} · priority {item.priority}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canApprove ? (
                      <form action={approveTeachingAction}>
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="version_number" value={version.versionNumber} />
                        <HiddenReturnFields status={status} page={page} />
                        <button
                          type="submit"
                          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-2 text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
                        >
                          اعتماد
                        </button>
                      </form>
                    ) : null}

                    {canPublish ? (
                      <form action={publishTeachingAction}>
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="version_number" value={version.versionNumber} />
                        <HiddenReturnFields status={status} page={page} />
                        <button
                          type="submit"
                          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-2 text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
                        >
                          نشر النسخة المعتمدة
                        </button>
                      </form>
                    ) : null}

                    {canArchive ? (
                      <form action={archiveTeachingAction}>
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="version_number" value={version.versionNumber} />
                        <HiddenReturnFields status={status} page={page} />
                        <button
                          type="submit"
                          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
                        >
                          {item.status === "published" ? "أرشفة وإيقاف" : "رفض وأرشفة"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>

                {version.summary ? (
                  <p className="mt-5 rounded-[var(--radius-sm)] border-r-2 border-[var(--gold-muted)] pr-3 text-sm leading-7 text-[var(--foreground-muted)]">
                    {version.summary}
                  </p>
                ) : null}

                <div className="mt-4 whitespace-pre-wrap text-sm leading-8 text-[var(--foreground)]">
                  {version.content}
                </div>

                {version.topics.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {version.topics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--foreground-subtle)]"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3 text-xs text-[var(--foreground-subtle)] sm:grid-cols-3" dir="ltr">
                  <span>latest: v{version.versionNumber}</span>
                  <span>approved: {item.approvedVersionNumber ? `v${item.approvedVersionNumber}` : "—"}</span>
                  <span>published: {item.publishedVersionNumber ? `v${item.publishedVersionNumber}` : "—"}</span>
                </div>

                <details className="mt-5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground-muted)]">
                    المصدر وProvenance ({item.sources.length})
                  </summary>
                  <div className="mt-4 grid gap-3">
                    {item.sources.length ? (
                      item.sources.map((source) => <SourcePreview key={source.id} source={source} />)
                    ) : (
                      <p className="text-sm text-[var(--foreground-subtle)]">
                        لا يوجد source lineage لهذه النسخة. يجب اعتبار ذلك حالة تحتاج مراجعة قبل النشر.
                      </p>
                    )}
                  </div>
                </details>

                {canEdit ? (
                  <details className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--gold-muted)]">
                      تعديل أو إعادة تصنيف المسودة
                    </summary>
                    <p className="mt-2 text-xs leading-6 text-[var(--foreground-subtle)]">
                      الحفظ هنا لا يغيّر النسخة الحالية. سيُنشئ v{version.versionNumber + 1} ويحفظ مصدر التعديل داخل provenance.
                    </p>
                    <form action={editTeachingDraftAction} className="mt-5 grid gap-4">
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="version_number" value={version.versionNumber} />
                      <HiddenReturnFields status={status} page={page} />

                      <label className="grid gap-2 text-sm">
                        <span className="font-medium">العنوان</span>
                        <input
                          name="title"
                          required
                          maxLength={200}
                          defaultValue={version.title}
                          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--gold-muted)]"
                        />
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span className="font-medium">المحتوى</span>
                        <textarea
                          name="content"
                          required
                          maxLength={16000}
                          rows={7}
                          defaultValue={version.content}
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 leading-7 outline-none focus:border-[var(--gold-muted)]"
                        />
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Semantic layer</span>
                          <select
                            name="semantic_layer"
                            defaultValue={item.semanticLayer}
                            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--gold-muted)]"
                            dir="ltr"
                          >
                            {TEACH_ESLAM_SEMANTIC_LAYERS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Teaching type</span>
                          <select
                            name="item_type"
                            defaultValue={item.itemType}
                            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--gold-muted)]"
                            dir="ltr"
                          >
                            {TEACH_ESLAM_ITEM_TYPES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Priority</span>
                          <input
                            type="number"
                            name="priority"
                            min={0}
                            max={1000}
                            step={1}
                            defaultValue={item.priority}
                            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--gold-muted)]"
                            dir="ltr"
                          />
                        </label>

                        <label className="grid gap-2 text-sm">
                          <span className="font-medium">Topics</span>
                          <input
                            name="topics"
                            maxLength={1500}
                            defaultValue={version.topics.join("، ")}
                            className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--gold-muted)]"
                          />
                        </label>
                      </div>

                      <label className="grid gap-2 text-sm">
                        <span className="font-medium">Summary</span>
                        <textarea
                          name="summary"
                          maxLength={1200}
                          rows={3}
                          defaultValue={version.summary ?? ""}
                          className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 leading-7 outline-none focus:border-[var(--gold-muted)]"
                        />
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span className="font-medium">سبب التعديل / Change note</span>
                        <input
                          name="change_note"
                          maxLength={1000}
                          placeholder="ما الذي تغير ولماذا؟"
                          className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--gold-muted)]"
                        />
                      </label>

                      <button
                        type="submit"
                        className="min-h-11 justify-self-start rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-2 text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
                      >
                        حفظ كنسخة جديدة
                      </button>
                    </form>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>

        {!reviewPage.items.length ? (
          <div className="mt-6 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-8 text-center">
            <p className="text-sm text-[var(--foreground-muted)]">لا توجد تعليمات في هذا الفلتر حالياً.</p>
            <Link
              href="/admin/teach"
              className="mt-4 inline-block text-sm font-semibold text-[var(--gold-muted)] hover:text-[var(--gold-bright)]"
            >
              أضف تعليماً جديداً
            </Link>
          </div>
        ) : null}

        {reviewPage.hasPreviousPage || reviewPage.hasNextPage ? (
          <nav className="mt-7 flex items-center justify-between gap-3" aria-label="صفحات مراجعة التعليمات">
            {reviewPage.hasPreviousPage ? (
              <Link
                href={`/admin/brain?status=${status}&page=${page - 1}`}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)]"
              >
                الأحدث
              </Link>
            ) : (
              <span />
            )}

            <span className="text-xs text-[var(--foreground-subtle)]" dir="ltr">
              Page {page}
            </span>

            {reviewPage.hasNextPage ? (
              <Link
                href={`/admin/brain?status=${status}&page=${page + 1}`}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)]"
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
  );
}
