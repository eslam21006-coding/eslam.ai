import Link from "next/link";

import { VoiceRecorder } from "@/features/voice-recorder/voice-recorder";
import { loadVoiceTeachingState } from "@/features/voice-teaching/data";
import { VoiceTeachingWorkbench } from "@/features/voice-teaching/workbench";
import { loadVoiceTranscriptionList } from "@/features/voice-transcription/data";
import { VoiceTranscriptionList } from "@/features/voice-transcription/transcription-list";
import { requireAdmin } from "@/lib/auth/admin";

export const maxDuration = 300;

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Admin voice pipeline: recording → transcription → reviewed teaching candidates → Brain drafts. */
export default async function VoiceRecorderPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const authorization = await requireAdmin();
  const resolvedSearchParams = await searchParams;
  const requestedPage = parsePage(resolvedSearchParams.page);
  const transcriptionPage = await loadVoiceTranscriptionList(
    authorization.userId,
    requestedPage,
  );
  const transcriptionItems = transcriptionPage.items;
  const completedTranscriptionIds = transcriptionItems.flatMap((item) =>
    item.transcriptionStatus === "completed" && item.transcriptionId ? [item.transcriptionId] : [],
  );
  const teachingByTranscription = await loadVoiceTeachingState(
    authorization.userId,
    completedTranscriptionIds,
  );
  const teachingItems = transcriptionItems.flatMap((item) => {
    if (item.transcriptionStatus !== "completed" || !item.transcriptionId) return [];
    const extraction = teachingByTranscription.get(item.transcriptionId);
    if (!extraction) return [];
    return [
      {
        transcriptionId: item.transcriptionId,
        completedAt: item.completedAt,
        extraction,
      },
    ];
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Voice teaching</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">تعليم إسلام بالصوت</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
            سجّل المصدر الصوتي، حوّله إلى Transcript، ثم استخرج منه Teachings قابلة للمراجعة. أنت تختار وتعدّل ما يتحول إلى Brain draft؛ لا شيء يُنشر تلقائياً.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/teach"
            className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
          >
            العودة إلى تدريب إسلام
          </Link>
          <Link
            href="/admin/brain?status=draft&page=1"
            className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-center text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
          >
            فتح عقل إسلام
          </Link>
        </div>
      </div>

      <VoiceRecorder />
      <VoiceTeachingWorkbench items={teachingItems} />

      <details className="mt-7 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground-muted)]">
          سجل التسجيلات والـTranscripts
        </summary>
        <p className="mt-2 text-xs leading-6 text-[var(--foreground-subtle)]">
          التسجيلات والـTranscripts تظل محفوظة كسجل ومصدر، بينما تعرض قائمة العمل الرئيسية ما يزال يحتاج مراجعة فقط.
        </p>
        <VoiceTranscriptionList
          items={transcriptionItems}
          page={transcriptionPage.page}
          hasPrevious={transcriptionPage.hasPrevious}
          hasNext={transcriptionPage.hasNext}
        />
      </details>

      <aside className="mt-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4 text-sm leading-7 text-[var(--foreground-muted)]">
        الاستخراج ينتج candidates فقط، وإنشاء المسودات يتطلب اختياراً ومراجعة منك. المسودات لا تصبح جزءاً فعالاً من إجابات Eslam.AI إلا بعد Approval وPublish صريحين من عقل إسلام.
      </aside>
    </div>
  );
}
