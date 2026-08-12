"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { transcribeVoiceRecordingAction } from "@/features/voice-transcription/actions";

type Props = {
  recordingId: string;
  status: string | null;
  canTranscribe: boolean;
};

function actionErrorMessage(error: string) {
  switch (error) {
    case "not-found":
      return "لم يعد التسجيل متاحاً للتحويل إلى نص.";
    case "audio-too-large":
      return "حجم التسجيل أكبر من الحد الذي تقبله خدمة التحويل إلى نص.";
    case "storage-download":
      return "تعذر قراءة الملف الصوتي الخاص. حاول مرة أخرى.";
    case "finalize-conflict":
      return "انتهت محاولة أخرى أحدث أثناء هذه المحاولة. حدّثت الحالة الحالية.";
    case "invalid-request":
      return "طلب التحويل غير صالح.";
    default:
      return "تعذر إكمال التحويل إلى نص. يمكنك إعادة المحاولة.";
  }
}

export function TranscribeButton({ recordingId, status, canTranscribe }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (status === "completed") return null;

  const label =
    status === "failed" || status === "processing"
      ? "إعادة محاولة التحويل"
      : "تحويل إلى نص";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        disabled={!canTranscribe || isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await transcribeVoiceRecordingAction({ recordingId });
              if (!result.ok) {
                setMessage(actionErrorMessage(result.error));
              } else if (result.state === "processing") {
                setMessage("هناك محاولة تحويل جارية بالفعل لهذا التسجيل.");
              } else {
                setMessage("اكتمل التحويل إلى نص.");
              }
              router.refresh();
            } catch (error) {
              console.error("Voice transcription request rejected", {
                message: error instanceof Error ? error.message : "Unknown error",
              });
              setMessage("انقطع الاتصال أثناء التحويل. التسجيل محفوظ ويمكنك إعادة المحاولة.");
              router.refresh();
            }
          });
        }}
        className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[var(--gold-bright)] transition enabled:hover:border-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {isPending ? "جارٍ التحويل…" : !canTranscribe ? "التحويل جارٍ…" : label}
      </button>
      <p
        className="max-w-sm text-xs leading-5 text-[var(--foreground-muted)]"
        aria-live="polite"
        role="status"
      >
        {message}
      </p>
    </div>
  );
}
