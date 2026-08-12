"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelVoiceRecordingUploadAction,
  createVoiceRecordingUploadAction,
  finalizeVoiceRecordingUploadAction,
  retryQueuedVoiceRecordingCleanupsAction,
} from "@/features/voice-recorder/actions";
import {
  VOICE_RECORDING_AUDIO_BITS_PER_SECOND,
  VOICE_RECORDING_MAX_BYTES,
  VOICE_RECORDING_MAX_DURATION_MS,
  formatVoiceBytes,
  formatVoiceDuration,
  normalizeVoiceRecordingMimeType,
  type VoiceUploadIntent,
} from "@/features/voice-recorder/core";
import { createClient } from "@/lib/supabase/client";

type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "preview"
  | "uploading"
  | "cleaning"
  | "cleanup-error"
  | "finalize-error"
  | "uploaded"
  | "error";

type CleanupPurpose = "discard-local" | "preserve-local";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
] as const;

function recorderErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "تم رفض إذن الميكروفون. اسمح بالوصول للميكروفون من إعدادات المتصفح ثم حاول مرة أخرى.";
    }
    if (error.name === "NotFoundError") {
      return "لم يتم العثور على ميكروفون متاح على هذا الجهاز.";
    }
    if (error.name === "NotReadableError" || error.name === "AbortError") {
      return "تعذر استخدام الميكروفون حالياً. قد يكون مستخدماً من تطبيق آخر.";
    }
  }

  return "تعذر بدء التسجيل. تأكد من صلاحية الميكروفون ثم حاول مرة أخرى.";
}

function chooseRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Browser recorder for local capture, preview, and direct signed upload to private Supabase Storage. */
export function VoiceRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<VoiceUploadIntent | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);

  const isMountedRef = useRef(false);
  const cleanupPurposeRef = useRef<CleanupPurpose>("discard-local");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const accumulatedMsRef = useRef(0);
  const segmentStartedAtRef = useRef<number | null>(null);
  const finalDurationRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  const activeDuration = useCallback(() => {
    const currentSegment = segmentStartedAtRef.current;
    return Math.max(
      0,
      accumulatedMsRef.current +
        (currentSegment === null ? 0 : performance.now() - currentSegment),
    );
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const finalDuration = Math.min(
      VOICE_RECORDING_MAX_DURATION_MS,
      Math.max(1, Math.round(activeDuration())),
    );
    accumulatedMsRef.current = finalDuration;
    segmentStartedAtRef.current = null;
    finalDurationRef.current = finalDuration;
    setElapsedMs(finalDuration);
    recorder.stop();
  }, [activeDuration]);

  useEffect(() => {
    if (status !== "recording") return;

    const interval = window.setInterval(() => {
      const nextElapsed = activeDuration();
      setElapsedMs(Math.min(nextElapsed, VOICE_RECORDING_MAX_DURATION_MS));
      if (nextElapsed >= VOICE_RECORDING_MAX_DURATION_MS) stopRecording();
    }, 250);

    return () => window.clearInterval(interval);
  }, [activeDuration, status, stopRecording]);

  useEffect(() => {
    isMountedRef.current = true;

    void retryQueuedVoiceRecordingCleanupsAction().then((result) => {
      if (!result.ok) {
        console.warn("Some queued voice recording cleanup is still pending", {
          cleaned: result.cleaned,
          failed: result.failed,
        });
      }
    });

    return () => {
      isMountedRef.current = false;

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        recorder.stop();
      }

      stopStream();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, [stopStream]);

  const clearLocalRecording = useCallback(() => {
    revokePreview();
    setAudioBlob(null);
    setMimeType(null);
    setElapsedMs(0);
    setDurationMs(0);
    accumulatedMsRef.current = 0;
    segmentStartedAtRef.current = null;
    finalDurationRef.current = 0;
    chunksRef.current = [];
    recorderRef.current = null;
    cleanupPurposeRef.current = "discard-local";
    setUploadedId(null);
  }, [revokePreview]);

  const startRecording = useCallback(async () => {
    setMessage(null);
    setUploadedId(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setStatus("error");
      setMessage(
        "هذا المتصفح لا يدعم تسجيل الصوت بالطريقة المطلوبة. استخدم إصداراً حديثاً من Chrome أو Edge أو Safari.",
      );
      return;
    }

    const selectedMimeType = chooseRecorderMimeType();
    if (!selectedMimeType) {
      setStatus("error");
      setMessage("المتصفح لا يوفر صيغة صوت مدعومة للتسجيل في Eslam.AI.");
      return;
    }

    clearLocalRecording();
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!isMountedRef.current) {
        stopMediaStream(stream);
        return;
      }

      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: VOICE_RECORDING_AUDIO_BITS_PER_SECOND,
      });

      recorderRef.current = recorder;
      chunksRef.current = [];
      accumulatedMsRef.current = 0;
      finalDurationRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        stopStream();
        if (!isMountedRef.current) return;
        setStatus("error");
        setMessage("حدث خطأ أثناء التسجيل. لم يتم رفع أي ملف ويمكنك إعادة المحاولة.");
      };

      recorder.onstop = () => {
        stopStream();
        if (!isMountedRef.current) return;

        const actualMimeType = normalizeVoiceRecordingMimeType(
          recorder.mimeType || selectedMimeType,
        );
        const finalDuration = Math.min(
          VOICE_RECORDING_MAX_DURATION_MS,
          Math.max(1, finalDurationRef.current || Math.round(activeDuration())),
        );
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || selectedMimeType,
        });

        if (!actualMimeType || blob.size === 0) {
          setStatus("error");
          setMessage("لم ينتج التسجيل ملفاً صوتياً صالحاً. أعد التسجيل مرة أخرى.");
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        previewUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
        setAudioBlob(blob);
        setMimeType(actualMimeType);
        setDurationMs(finalDuration);
        setElapsedMs(finalDuration);
        setStatus("preview");
        setMessage(
          blob.size > VOICE_RECORDING_MAX_BYTES
            ? "حجم التسجيل أكبر من 25 MB. استمع إليه إن أردت ثم أعد التسجيل لمدة أقصر قبل الحفظ."
            : null,
        );
      };

      segmentStartedAtRef.current = performance.now();
      recorder.start(1000);
      setStatus("recording");
    } catch (error) {
      stopStream();
      if (!isMountedRef.current) return;
      setStatus("error");
      setMessage(recorderErrorMessage(error));
    }
  }, [activeDuration, clearLocalRecording, stopStream]);

  const pauseRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    accumulatedMsRef.current = Math.min(activeDuration(), VOICE_RECORDING_MAX_DURATION_MS);
    segmentStartedAtRef.current = null;
    recorder.pause();
    setElapsedMs(accumulatedMsRef.current);
    setStatus("paused");
  }, [activeDuration]);

  const resumeRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;

    if (accumulatedMsRef.current >= VOICE_RECORDING_MAX_DURATION_MS) {
      stopRecording();
      return;
    }

    segmentStartedAtRef.current = performance.now();
    recorder.resume();
    setStatus("recording");
  }, [stopRecording]);

  const cleanupPendingRecording = useCallback(async (intent: VoiceUploadIntent) => {
    setStatus("cleaning");
    setMessage("جارٍ تنظيف محاولة الحفظ السابقة…");

    try {
      const cleanup = await cancelVoiceRecordingUploadAction({
        recordingId: intent.recordingId,
      });

      if (!isMountedRef.current) return false;

      if (!cleanup.ok) {
        setPendingIntent(intent);
        setStatus("cleanup-error");
        setMessage(
          "تعذر تنظيف محاولة الحفظ السابقة. احتفظنا بمرجع التسجيل؛ اضغط إعادة محاولة التنظيف.",
        );
        return false;
      }

      setPendingIntent(null);
      return true;
    } catch (error) {
      console.error("Voice recording cleanup request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      if (!isMountedRef.current) return false;

      setPendingIntent(intent);
      setStatus("cleanup-error");
      setMessage(
        "تعذر الاتصال أثناء تنظيف محاولة الحفظ السابقة. احتفظنا بمرجع التسجيل؛ اضغط إعادة محاولة التنظيف.",
      );
      return false;
    }
  }, []);

  const resetForNewRecording = useCallback(async () => {
    cleanupPurposeRef.current = "discard-local";
    if (pendingIntent) {
      const cleaned = await cleanupPendingRecording(pendingIntent);
      if (!cleaned || !isMountedRef.current) return;
    }

    clearLocalRecording();
    setMessage(null);
    setStatus("idle");
  }, [cleanupPendingRecording, clearLocalRecording, pendingIntent]);

  const finalizeIntent = useCallback(
    async (intent: VoiceUploadIntent) => {
      try {
        const finalization = await finalizeVoiceRecordingUploadAction({
          recordingId: intent.recordingId,
          durationMs,
        });

        if (!isMountedRef.current) return;

        if (!finalization.ok) {
          if (finalization.error === "not-found") {
            cleanupPurposeRef.current = "discard-local";
            setPendingIntent(null);
            setStatus("preview");
            setMessage(
              "انتهت محاولة الحفظ السابقة. التسجيل المحلي ما زال محفوظاً ويمكنك الضغط على حفظ التسجيل لإنشاء محاولة رفع جديدة.",
            );
            return;
          }

          setPendingIntent(intent);
          setStatus("finalize-error");
          setMessage(
            "تم رفع الصوت، لكن لم يكتمل تثبيت بياناته. الملف لم يضع، واضغط إعادة المحاولة لإكمال الحفظ.",
          );
          return;
        }

        cleanupPurposeRef.current = "discard-local";
        setPendingIntent(null);
        setUploadedId(finalization.recordingId);
        setStatus("uploaded");
        setMessage("تم حفظ التسجيل في مساحة خاصة بنجاح. أصبح جاهزاً لمهمة التحويل إلى نص لاحقاً.");
      } catch (error) {
        console.error("Voice recording finalization request failed", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
        if (!isMountedRef.current) return;

        setPendingIntent(intent);
        setStatus("finalize-error");
        setMessage(
          "تم رفع الصوت، لكن تعذر إكمال التحقق من الحفظ بسبب مشكلة اتصال. التسجيل المحلي محفوظ ويمكنك إعادة محاولة تثبيت الحفظ.",
        );
      }
    },
    [durationMs],
  );

  const uploadRecording = useCallback(async () => {
    if (
      !audioBlob ||
      !mimeType ||
      durationMs <= 0 ||
      durationMs > VOICE_RECORDING_MAX_DURATION_MS ||
      audioBlob.size <= 0 ||
      audioBlob.size > VOICE_RECORDING_MAX_BYTES
    ) {
      setMessage("التسجيل الحالي غير صالح للحفظ. أعد التسجيل ثم حاول مرة أخرى.");
      return;
    }

    setStatus("uploading");
    setMessage(null);

    let intentResult: Awaited<ReturnType<typeof createVoiceRecordingUploadAction>>;
    try {
      intentResult = await createVoiceRecordingUploadAction({ mimeType });
    } catch (error) {
      console.error("Voice recording upload intent request failed", {
        message: error instanceof Error ? error.message : "Unknown error",
      });
      if (!isMountedRef.current) return;

      setStatus("preview");
      setMessage("تعذر الاتصال لتجهيز مساحة رفع التسجيل. التسجيل المحلي محفوظ ويمكنك محاولة الحفظ مرة أخرى.");
      return;
    }

    if (!isMountedRef.current) {
      if (intentResult.ok) {
        void cancelVoiceRecordingUploadAction({
          recordingId: intentResult.intent.recordingId,
        }).catch(() => undefined);
      }
      return;
    }

    if (!intentResult.ok) {
      setStatus("preview");
      setMessage("تعذر تجهيز مساحة رفع خاصة للتسجيل. حاول الحفظ مرة أخرى.");
      return;
    }

    const intent = intentResult.intent;
    setPendingIntent(intent);
    const fileName = intent.storagePath.split("/").at(-1) ?? `${intent.recordingId}.audio`;
    const file = new File([audioBlob], fileName, { type: intent.mimeType });
    const supabase = createClient();

    let uploadErrorMessage: string | null = null;
    try {
      const { error: uploadError } = await supabase.storage
        .from(intent.bucket)
        .uploadToSignedUrl(intent.storagePath, intent.token, file, {
          contentType: intent.mimeType,
          upsert: false,
        });
      uploadErrorMessage = uploadError?.message ?? null;
    } catch (error) {
      uploadErrorMessage = error instanceof Error ? error.message : "Unknown upload error";
    }

    if (uploadErrorMessage) {
      console.error("Signed voice upload failed", { message: uploadErrorMessage });
      cleanupPurposeRef.current = "preserve-local";
      const cleaned = await cleanupPendingRecording(intent);
      if (!isMountedRef.current) return;

      if (!cleaned) {
        setMessage(
          "فشل رفع التسجيل وتعذر تنظيف محاولة الرفع. التسجيل المحلي ما زال موجوداً؛ أعد محاولة التنظيف ثم حاول الحفظ مرة أخرى.",
        );
        return;
      }

      cleanupPurposeRef.current = "discard-local";
      setStatus("preview");
      setMessage("فشل رفع التسجيل. الملف المحلي ما زال موجوداً ويمكنك المحاولة مرة أخرى.");
      return;
    }

    if (!isMountedRef.current) {
      void cancelVoiceRecordingUploadAction({ recordingId: intent.recordingId }).catch(() => undefined);
      return;
    }

    await finalizeIntent(intent);
  }, [audioBlob, cleanupPendingRecording, durationMs, finalizeIntent, mimeType]);

  const retryFinalization = useCallback(async () => {
    if (!pendingIntent) return;
    setStatus("uploading");
    setMessage("يتم التحقق من الملف وإكمال الحفظ…");
    await finalizeIntent(pendingIntent);
  }, [finalizeIntent, pendingIntent]);

  const retryCleanup = useCallback(async () => {
    if (!pendingIntent) return;
    const purpose = cleanupPurposeRef.current;
    const cleaned = await cleanupPendingRecording(pendingIntent);
    if (!cleaned || !isMountedRef.current) return;

    cleanupPurposeRef.current = "discard-local";
    if (purpose === "preserve-local") {
      setStatus("preview");
      setMessage("تم تنظيف محاولة الرفع الفاشلة. التسجيل المحلي محفوظ ويمكنك محاولة الحفظ مرة أخرى.");
      return;
    }

    clearLocalRecording();
    setMessage(null);
    setStatus("idle");
  }, [cleanupPendingRecording, clearLocalRecording, pendingIntent]);

  const isCapturing = status === "recording" || status === "paused";
  const canUpload =
    status === "preview" &&
    Boolean(audioBlob) &&
    Boolean(mimeType) &&
    durationMs > 0 &&
    durationMs <= VOICE_RECORDING_MAX_DURATION_MS &&
    (audioBlob?.size ?? 0) > 0 &&
    (audioBlob?.size ?? 0) <= VOICE_RECORDING_MAX_BYTES;

  return (
    <section
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
      aria-labelledby="voice-recorder-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--gold-muted)]">Private voice capture</p>
          <h2 id="voice-recorder-title" className="mt-2 text-2xl font-semibold">
            سجّل ما تريد أن تعلّمه لإسلام
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
            التسجيل يُراجع محلياً أولاً. لن يُرفع أي صوت قبل أن تضغط حفظ التسجيل.
          </p>
        </div>
        <span
          className="w-fit rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1 text-xs text-[var(--foreground-subtle)]"
          dir="ltr"
        >
          Max 60 min · 25 MB
        </span>
      </div>

      <div className="mt-7 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-7 text-center">
        <div
          className="font-mono text-4xl font-semibold tracking-[0.12em] tabular-nums sm:text-5xl"
          dir="ltr"
          aria-label={`مدة التسجيل ${formatVoiceDuration(isCapturing ? elapsedMs : durationMs)}`}
        >
          {formatVoiceDuration(isCapturing ? elapsedMs : durationMs)}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {status === "idle" || status === "error" ? (
            <button
              type="button"
              onClick={startRecording}
              className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
            >
              بدء التسجيل
            </button>
          ) : null}

          {status === "requesting" ? (
            <span className="min-h-11 px-4 py-3 text-sm text-[var(--foreground-muted)]">
              بانتظار إذن الميكروفون…
            </span>
          ) : null}

          {status === "recording" ? (
            <>
              <button
                type="button"
                onClick={pauseRecording}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-3 text-sm font-semibold"
              >
                إيقاف مؤقت
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]"
              >
                إنهاء التسجيل
              </button>
            </>
          ) : null}

          {status === "paused" ? (
            <>
              <button
                type="button"
                onClick={resumeRecording}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]"
              >
                استكمال التسجيل
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-3 text-sm font-semibold"
              >
                إنهاء التسجيل
              </button>
            </>
          ) : null}
        </div>

        {status === "recording" ? (
          <p className="mt-4 text-xs font-medium text-[var(--foreground-subtle)]">● التسجيل جارٍ الآن</p>
        ) : null}
        {status === "paused" ? (
          <p className="mt-4 text-xs font-medium text-[var(--foreground-subtle)]">التسجيل متوقف مؤقتاً</p>
        ) : null}
      </div>

      {previewUrl && audioBlob ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">راجع التسجيل قبل الحفظ</h3>
              <p className="mt-1 text-xs text-[var(--foreground-subtle)]" dir="ltr">
                {formatVoiceDuration(durationMs)} · {formatVoiceBytes(audioBlob.size)} · {mimeType}
              </p>
            </div>
          </div>

          <audio className="mt-4 w-full" src={previewUrl} controls preload="metadata">
            متصفحك لا يدعم تشغيل الصوت.
          </audio>

          <div className="mt-4 flex flex-wrap gap-3">
            {canUpload ? (
              <button
                type="button"
                onClick={uploadRecording}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]"
              >
                حفظ التسجيل
              </button>
            ) : null}

            {status === "uploading" ? (
              <button
                type="button"
                disabled
                className="min-h-11 cursor-wait rounded-[var(--radius-sm)] border border-[var(--border)] px-5 py-3 text-sm text-[var(--foreground-muted)]"
              >
                جارٍ الحفظ…
              </button>
            ) : null}

            {status === "cleaning" ? (
              <button
                type="button"
                disabled
                className="min-h-11 cursor-wait rounded-[var(--radius-sm)] border border-[var(--border)] px-5 py-3 text-sm text-[var(--foreground-muted)]"
              >
                جارٍ التنظيف…
              </button>
            ) : null}

            {status === "finalize-error" && pendingIntent ? (
              <button
                type="button"
                onClick={retryFinalization}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]"
              >
                إعادة محاولة تثبيت الحفظ
              </button>
            ) : null}

            {status === "cleanup-error" && pendingIntent ? (
              <button
                type="button"
                onClick={retryCleanup}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]"
              >
                إعادة محاولة التنظيف
              </button>
            ) : null}

            {(status === "preview" || status === "finalize-error" || status === "uploaded") ? (
              <button
                type="button"
                onClick={resetForNewRecording}
                className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-3 text-sm font-semibold text-[var(--foreground-muted)]"
              >
                {status === "uploaded" ? "تسجيل جديد" : "إعادة التسجيل"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {uploadedId ? (
        <div className="mt-5 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--gold-bright)]">التسجيل محفوظ بشكل خاص.</p>
          <p className="mt-1 break-all text-xs text-[var(--foreground-muted)]" dir="ltr">
            Recording ID: {uploadedId}
          </p>
        </div>
      ) : null}

      <div className="mt-5 min-h-6" aria-live="polite" aria-atomic="true">
        {message ? <p className="text-sm leading-6 text-[var(--foreground-muted)]">{message}</p> : null}
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-5 text-xs leading-6 text-[var(--foreground-subtle)]">
        الصوت يُحفظ في مساحة خاصة ولا يصبح جزءاً من Brain تلقائياً. Task 18 لا يقوم بأي transcription أو استخراج تعليمات من التسجيل.
      </div>
    </section>
  );
}
