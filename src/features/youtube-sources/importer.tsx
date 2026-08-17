"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent } from "react";

import type { YouTubeTranscriptImportView } from "@/features/knowledge-library/data";
import {
  importYouTubeSourceAction,
  refreshYouTubeTranscriptImportAction,
} from "@/features/youtube-sources/actions";

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-url": "اكتب رابط فيديو YouTube صحيحاً، وليس رابط قناة أو Playlist.",
  "invalid-language": "كود اللغة اختياري. استخدم صيغة مثل ar أو en أو en-US.",
  "provider-not-configured": "خدمة جلب Transcript من YouTube غير مفعلة على السيرفر حالياً.",
  "transcript-unavailable": "لم نجد Transcript أو Captions متاحة لهذا الفيديو باللغة المطلوبة.",
  "provider-failed": "تعذر جلب Transcript من YouTube الآن. أعد المحاولة بدون تغيير أي مصدر محفوظ.",
  "storage-failed": "تم جلب Transcript لكن تعذر حفظه بأمان في مكتبة المعرفة.",
  "index-failed": "تم حفظ Transcript كمصدر، لكن تجهيز البحث يحتاج إعادة محاولة من قائمة المصادر.",
  "transcript-too-large": "Transcript أكبر من الحد الآمن للاستيراد.",
  "invalid-request": "طلب تحديث Transcript غير صالح.",
  "not-found": "لم تعد محاولة الاستيراد موجودة.",
};

function messageForResult(result: { ok: boolean; error?: string; state?: string }) {
  if (!result.ok) return ERROR_MESSAGES[result.error ?? ""] ?? "تعذر إكمال استيراد YouTube.";
  if (result.state === "processing") return "الفيديو كبير ويجري تجهيز Transcript في الخلفية عند مزود الخدمة. يمكنك تحديث حالته من البطاقة أدناه.";
  if (result.state === "ready") return "تم حفظ Transcript وأصبح جاهزاً للبحث والمقابلات المبنية على Grounding.";
  return "تم حفظ Transcript ويجري تجهيز البحث داخله.";
}

/** Admin-only YouTube URL importer that keeps external video material in Knowledge, never Brain. */
export function YouTubeSourceImporter({ imports }: { imports: YouTubeTranscriptImportView[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setPendingId("new");
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await importYouTubeSourceAction({ url, language });
        setMessage(messageForResult(result));
        if (result.ok && result.state !== "processing") setUrl("");
        router.refresh();
      } catch (error) {
        console.error("YouTube source import failed", { message: error instanceof Error ? error.message : "Unknown import error" });
        setMessage("تعذر إكمال استيراد YouTube الآن.");
      } finally {
        setPendingId(null);
      }
    });
  }

  function refreshImport(importId: string) {
    if (isPending) return;
    setPendingId(importId);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await refreshYouTubeTranscriptImportAction({ importId });
        setMessage(messageForResult(result));
        router.refresh();
      } catch (error) {
        console.error("YouTube transcript refresh failed", { message: error instanceof Error ? error.message : "Unknown refresh error" });
        setMessage("تعذر تحديث حالة Transcript الآن.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6" aria-labelledby="youtube-source-title">
      <div className="max-w-3xl">
        <p className="text-xs font-medium text-[var(--gold-muted)]">YouTube → Knowledge Library</p>
        <h2 id="youtube-source-title" className="mt-2 text-xl font-semibold">أضف فيديو كمصدر مرجعي</h2>
        <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">
          الصق رابط الفيديو. سنحفظ الـ Transcript المتاح كمصدر مرجعي خاص، ثم يصبح قابلاً للبحث ويمكن لـ Interview Eslam أن يبني عليه سؤالاً موثقاً. محتوى الفيديو لا يصبح رأي إسلام أو تعليماً في Brain تلقائياً.
        </p>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-3 lg:grid-cols-[1fr_140px_auto] lg:items-end">
        <label className="block">
          <span className="text-xs font-medium text-[var(--foreground-muted)]">رابط YouTube</span>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            maxLength={2048}
            dir="ltr"
            placeholder="https://www.youtube.com/watch?v=..."
            className="mt-2 min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--background)] px-4 text-sm outline-none focus:border-[var(--gold-muted)]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--foreground-muted)]">اللغة اختياري</span>
          <input
            type="text"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            maxLength={35}
            dir="ltr"
            placeholder="ar / en"
            className="mt-2 min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--background)] px-4 text-sm outline-none focus:border-[var(--gold-muted)]"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)] disabled:opacity-50"
        >
          {isPending && pendingId === "new" ? "جارٍ الاستيراد…" : "استيراد Transcript"}
        </button>
      </form>

      <p className="mt-3 text-xs leading-6 text-[var(--foreground-subtle)]">
        الاستيراد يستخدم Captions/Transcript موجودة بالفعل. لا يتم إنشاء Transcript بالذكاء الاصطناعي تلقائياً إذا لم تكن متاحة.
      </p>

      {message ? <p role="status" className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-7 text-[var(--foreground-muted)]">{message}</p> : null}

      {imports.length ? (
        <div className="mt-5 space-y-3" aria-label="محاولات YouTube التي لم تكتمل بعد">
          {imports.map((item) => (
            <article key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" dir="auto">{item.videoTitle}</p>
                  <p className="mt-1 text-xs text-[var(--foreground-subtle)]">{item.channelName ?? "YouTube"} · <span dir="ltr">{item.videoId}</span></p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${item.status === "failed" ? "border-[color:var(--danger)]/30 text-[var(--danger)]" : "border-[var(--border-strong)] text-[var(--gold-muted)]"}`}>
                    {item.status === "failed" ? "تعذر جلب Transcript" : "Transcript قيد التجهيز"}
                  </span>
                  {item.status === "processing" ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => refreshImport(item.id)}
                      className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--foreground-muted)] disabled:opacity-50"
                    >
                      {isPending && pendingId === item.id ? "جارٍ التحديث…" : "تحديث الحالة"}
                    </button>
                  ) : null}
                </div>
              </div>
              {item.status === "failed" ? <p className="mt-2 text-xs leading-6 text-[var(--foreground-subtle)]">أعد إدخال نفس رابط الفيديو بالأعلى لبدء محاولة جديدة.</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
