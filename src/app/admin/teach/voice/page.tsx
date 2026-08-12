import Link from "next/link";

import { VoiceRecorder } from "@/features/voice-recorder/voice-recorder";
import { loadVoiceTeachingState } from "@/features/voice-teaching/data";
import { VoiceTeachingWorkbench } from "@/features/voice-teaching/workbench";
import { loadVoiceTranscriptionList } from "@/features/voice-transcription/data";
import { VoiceTranscriptionList } from "@/features/voice-transcription/transcription-list";
import { requireAdmin } from "@/lib/auth/admin";

export const maxDuration = 300;

export default async function VoiceRecorderPage() {
  const authorization = await requireAdmin();
  const transcriptionItems = await loadVoiceTranscriptionList(authorization.userId);
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight" dir="ltr">
            Voice → Teach Eslam
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
            سجّل المصدر الصوتي، حوّله إلى transcript، ثم استخرج منه Teachings قابلة للمراجعة. أنت تختار وتعدّل ما يتحول إلى Brain draft؛ لا شيء يُنشر تلقائياً.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/brain?status=draft"
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

      <VoiceRecorder />
      <VoiceTranscriptionList items={transcriptionItems} />
      <VoiceTeachingWorkbench items={teachingItems} />

      <aside className="mt-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4 text-sm leading-7 text-[var(--foreground-muted)]">
        <strong className="text-[var(--foreground)]">حدود Task 20:</strong> extraction ينتج candidates فقط، وإنشاء المسودات يتطلب اختياراً ومراجعة منك. المسودات لا تصبح جزءاً فعالاً من إجابات Eslam.AI إلا بعد Approval وPublish صريحين من Brain Review.
      </aside>
    </div>
  );
}
