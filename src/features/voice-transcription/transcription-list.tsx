import { formatVoiceBytes, formatVoiceDuration } from "@/features/voice-recorder/core";
import type { VoiceTranscriptionListItem } from "@/features/voice-transcription/data";
import { TranscribeButton } from "@/features/voice-transcription/transcribe-button";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function statusLabel(status: string | null) {
  if (status === "completed") return "مكتمل";
  if (status === "processing") return "جارٍ التحويل";
  if (status === "failed") return "قابل لإعادة المحاولة";
  return "لم يبدأ";
}

export function VoiceTranscriptionList({ items }: { items: VoiceTranscriptionListItem[] }) {
  return (
    <section
      className="mt-7 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
      aria-labelledby="saved-voice-title"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--gold-muted)]">Private source library</p>
          <h2 id="saved-voice-title" className="mt-2 text-2xl font-semibold">
            التسجيلات المحفوظة
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
            حوّل أي تسجيل محفوظ إلى transcript للمراجعة. النص الناتج يظل مادة مشتقة من المصدر الصوتي ولا يدخل Brain تلقائياً.
          </p>
        </div>
        <span className="text-xs text-[var(--foreground-subtle)]">آخر {items.length} تسجيل</span>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-5 py-8 text-center text-sm text-[var(--foreground-muted)]">
          لا توجد تسجيلات محفوظة بعد. احفظ أول تسجيل وسيظهر هنا.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <article
              key={item.recordingId}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-muted)]">
                      {statusLabel(item.transcriptionStatus)}
                    </span>
                    <span className="text-xs text-[var(--foreground-subtle)]">
                      {formatDate(item.uploadedAt)}
                    </span>
                  </div>
                  <p className="mt-3 break-all font-mono text-xs text-[var(--foreground-subtle)]" dir="ltr">
                    {item.recordingId}
                  </p>
                  <p className="mt-2 text-xs text-[var(--foreground-muted)]" dir="ltr">
                    {formatVoiceDuration(item.durationMs)} · {formatVoiceBytes(item.sizeBytes)} · {item.mimeType}
                  </p>
                  {item.model ? (
                    <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                      {item.model} · attempt {item.attemptCount ?? 1}
                    </p>
                  ) : null}
                </div>

                <TranscribeButton
                  recordingId={item.recordingId}
                  status={item.transcriptionStatus}
                  canTranscribe={item.canTranscribe}
                />
              </div>

              {item.transcriptionStatus === "processing" && !item.canTranscribe ? (
                <p className="mt-4 text-sm leading-6 text-[var(--foreground-muted)]">
                  محاولة التحويل الحالية ما زالت داخل مهلة التنفيذ. إذا انقطعت العملية، تصبح قابلة لإعادة المحاولة تلقائياً بعد انتهاء الـ lease.
                </p>
              ) : null}

              {item.transcriptionStatus === "failed" ? (
                <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--foreground-muted)]">
                  المحاولة السابقة لم تكتمل. التسجيل الأصلي ما زال محفوظاً ويمكن إعادة التحويل.
                  {item.lastErrorCode ? (
                    <span className="ms-2 font-mono text-xs text-[var(--foreground-subtle)]" dir="ltr">
                      {item.lastErrorCode}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {item.transcriptionStatus === "completed" && item.transcriptText ? (
                <div className="mt-5 border-t border-[var(--border)] pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Transcript</h3>
                    {item.completedAt ? (
                      <span className="text-xs text-[var(--foreground-subtle)]">
                        {formatDate(item.completedAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-sm leading-7 text-[var(--foreground)]">
                    {item.transcriptText}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
