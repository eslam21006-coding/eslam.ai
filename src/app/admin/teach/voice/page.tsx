import Link from "next/link";

import { VoiceRecorder } from "@/features/voice-recorder/voice-recorder";
import { loadVoiceTranscriptionList } from "@/features/voice-transcription/data";
import { VoiceTranscriptionList } from "@/features/voice-transcription/transcription-list";
import { requireAdmin } from "@/lib/auth/admin";

export const maxDuration = 300;

export default async function VoiceRecorderPage() {
  const authorization = await requireAdmin();
  const transcriptionItems = await loadVoiceTranscriptionList(authorization.userId);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Voice teaching</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight" dir="ltr">
            Voice Recorder
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
            سجّل فكرة أو مبدأ أو تجربة بصوتك، راجعها محلياً، احفظ المصدر الصوتي بشكل خاص، ثم حوّله إلى transcript للمراجعة قبل أي مرحلة تعليم لاحقة.
          </p>
        </div>
        <Link
          href="/admin/teach"
          className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground-muted)] transition hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
        >
          العودة إلى Teach Eslam
        </Link>
      </div>

      <VoiceRecorder />
      <VoiceTranscriptionList items={transcriptionItems} />

      <aside className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-4 text-sm leading-7 text-[var(--foreground-muted)]">
        <strong className="text-[var(--foreground)]">حدود Task 19:</strong> الـ transcript مادة مشتقة مرتبطة بالتسجيل الأصلي فقط. لا يتم استخراج تعليمات أو إنشاء Brain draft أو نشر أي شيء إلى Brain تلقائياً؛ هذا يظل ضمن Task 20.
      </aside>
    </div>
  );
}
