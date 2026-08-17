import Link from "next/link";

import {
  completeInterviewSessionAction,
  generateInterviewQuestionAction,
  notRelevantInterviewQuestionAction,
  retryInterviewAnswerExtractionAction,
  saveInterviewAnswerAction,
  setInterviewFocusAction,
  skipInterviewQuestionAction,
  startInterviewAction,
} from "@/features/interview-eslam/actions";
import { INTERVIEW_MAX_ANSWER_CHARS } from "@/features/interview-eslam/core";
import { INTERVIEW_MAX_FOCUS_CHARS } from "@/features/interview-eslam/intelligence-core";
import { loadInterviewPageState, type InterviewHistoryEntry } from "@/features/interview-eslam/data";

type InterviewPageProps = { searchParams: Promise<{ notice?: string; count?: string; next?: string }> };

/** Maps server-action outcomes to concise Arabic Admin notices without conflating failure causes. */
function noticeText(notice: string | undefined, count: string | undefined) {
  switch (notice) {
    case "started": return "بدأت أو استكملت المقابلة. السؤال الحالي مبني على معلومات موجودة فعلاً عن إسلام.";
    case "answer-saved": return `تم حفظ إجابتك واستخراج ${count ?? "0"} Brain draft للمراجعة، وتم تجهيز السؤال التالي.`;
    case "answer-saved-extraction-failed": return "تم حفظ إجابتك والسؤال التالي بأمان، لكن استخراج Brain drafts لم يكتمل. يمكنك إعادة المحاولة بدون كتابة الإجابة مرة أخرى.";
    case "answer-saved-needs-context": return `تم حفظ إجابتك واستخراج ${count ?? "0"} Brain draft. لم يجد النظام مادة كافية لسؤال جديد يحقق شرط الـ Grounding بدون اختراع سؤال عام.`;
    case "answer-saved-exhausted": return `تم حفظ إجابتك واستخراج ${count ?? "0"} Brain draft، لكن محاولات إنشاء السؤال التالي لم تنتج سؤالاً اجتاز التحقق. يمكنك إعادة المحاولة.`;
    case "answer-saved-next-failed": return `تم حفظ إجابتك واستخراج ${count ?? "0"} Brain draft، لكن إنشاء السؤال التالي لم يكتمل بسبب خطأ تقني.`;
    case "answer-saved-partial": return "تم حفظ الإجابة نفسها بأمان. تعذر جزء من المعالجة اللاحقة ويمكن إعادة المحاولة.";
    case "skipped": return "تم تخطي السؤال وحفظه في التاريخ حتى لا يعود فوراً بصياغة أخرى.";
    case "not-relevant": return "تم تسجيل السؤال كغير ذي صلة وسيتم كبح الأسئلة المشابهة.";
    case "topic-suppressed": return "تم تسجيل السؤال كغير ذي صلة وحفظ تفضيل دائم بعدم السؤال عن هذا الموضوع.";
    case "question-ready": return "تم إنشاء سؤال جديد يطابق Grounded Question Contract وقواعد عدم التكرار.";
    case "needs-context": return "لا توجد مادة كافية حالياً لإنشاء سؤال محدد ومفيد ضمن الـ Focus الحالي بدون سؤال عام. أضف أو راجع مواد تعليمية أو غيّر الـ Focus ثم حاول مرة أخرى.";
    case "exhausted": return "توجد مادة Grounding، لكن المحاولات لم تنتج سؤالاً اجتاز قواعد التحقق وعدم التكرار. أعد المحاولة لاحقاً.";
    case "focus-updated": return "تم حفظ Focus المقابلة. سيؤثر على السؤال التالي فقط، ولن يُستخدم أبداً كدليل أو Grounding.";
    case "focus-cleared": return "تم إلغاء Focus المقابلة. سيعود النظام لتوسيع التغطية بين المجالات.";
    case "focus-invalid": return "اكتب Focus مختصراً وواضحاً ضمن الحد المسموح.";
    case "focus-failed": return "تعذر تحديث Focus المقابلة. لم تتغير الجلسة.";
    case "session-completed": return "تم إنهاء الجلسة وحفظ تاريخها. يمكنك بدء جلسة جديدة في أي وقت.";
    case "session-invalid":
    case "session-failed": return "تعذر إنهاء الجلسة الحالية. لو توجد إجابة تحتاج Extraction، أعد استخراجها أولاً. لم يتم حذف أي تاريخ أو إجابات.";
    case "extraction-complete": return `اكتمل استخراج الإجابة إلى ${count ?? "0"} Brain draft للمراجعة.`;
    case "extraction-busy": return "استخراج هذه الإجابة قيد التنفيذ بالفعل.";
    case "answer-invalid": return "اكتب إجابة غير فارغة ضمن الحد المسموح ثم حاول مرة أخرى.";
    case "answer-failed": return "لم يتم حفظ الإجابة. لم يتم تغيير السؤال الحالي.";
    case "question-failed":
    case "question-invalid": return "لم يتم تحديث حالة السؤال. أعد المحاولة.";
    case "extraction-failed":
    case "extraction-invalid": return "لم يكتمل استخراج الإجابة إلى Brain drafts. الإجابة الأصلية محفوظة ويمكن إعادة المحاولة.";
    case "start-failed": return "تعذر بدء أو استكمال جلسة المقابلة.";
    case "failed": return "تعذر إنشاء سؤال جديد حالياً بسبب خطأ تقني. لم يتم اختراع سؤال بديل عام.";
    default: return null;
  }
}

/** Formats persisted UTC timestamps as Cairo local time for compact Arabic history labels. */
function formatInterviewDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(date);
}

/** Maps persisted question states to concise Admin-facing Arabic labels. */
function historyStatus(item: InterviewHistoryEntry) {
  if (item.status === "answered") return "تمت الإجابة";
  if (item.status === "skipped") return "تم التخطي";
  if (item.status === "not_relevant") return "غير ذي صلة";
  return "سؤال مفتوح";
}

/** Renders the Admin-only intelligent Interview Eslam workbench. */
export default async function InterviewEslamPage({ searchParams }: InterviewPageProps) {
  const params = await searchParams;
  const state = await loadInterviewPageState();
  const notice = noticeText(params.notice, params.count);
  const question = state.currentQuestion;
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-medium text-[var(--gold-muted)]">Teach Eslam · Intelligent Interview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">مقابلة إسلام</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
              سؤال واحد في كل مرة، مبني على شيء نعرفه بالفعل عن إسلام. النظام يتابع التغطية، يمنع التكرار المعنوي، ويوازن بين الـ Follow-up وتوسيع المعرفة. إجاباتك تظل مصادر خام وتتحول فقط إلى Brain drafts للمراجعة.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/teach" className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-3 text-sm font-medium text-[var(--foreground-muted)]">طرق التدريب</Link>
            <Link href="/admin/brain?status=draft&page=1" className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[var(--gold-bright)]">مراجعة Brain drafts</Link>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="تقدم المقابلات">
          {[
            ["إجابات محفوظة", state.analytics.answered],
            ["موضوعات بإجابات", state.analytics.distinctAnsweredTopics],
            ["مجالات تم استكشافها", `${state.analytics.exploredDomains}/${state.analytics.totalDomains}`],
            ["جلسات مكتملة", state.analytics.completedSessions],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
              <p className="text-xs text-[var(--foreground-subtle)]">{label}</p>
              <p className="mt-1 text-lg font-semibold" dir="ltr">{value}</p>
            </div>
          ))}
        </div>
      </header>

      {notice ? <div className="mt-5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-7 text-[var(--foreground-muted)]" role="status">{notice}</div> : null}

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7" aria-labelledby="coverage-heading">
        <div className="max-w-3xl">
          <h2 id="coverage-heading" className="text-lg font-semibold">خريطة التغطية</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">دي خريطة لما تم استكشافه فعلاً في المقابلات، وليست نسبة تقول إن عقل إسلام “اكتمل”. المجال يُعتبر مستكشفاً بمجرد وجود سؤال محفوظ فيه، مع فصل ما تمت الإجابة عنه عما تم تأجيله أو استبعاده.</p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {state.coverage.domains.map((domain) => (
            <article key={domain.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">{domain.label}</h3>
                <span className="text-xs text-[var(--foreground-subtle)]">{domain.explored ? "تم استكشافه" : "لم يُستكشف"}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-lg font-semibold" dir="ltr">{domain.captured}</p><p className="text-[11px] text-[var(--foreground-subtle)]">إجابة</p></div>
                <div><p className="text-lg font-semibold" dir="ltr">{domain.deferred}</p><p className="text-[11px] text-[var(--foreground-subtle)]">مؤجل</p></div>
                <div><p className="text-lg font-semibold" dir="ltr">{domain.excluded}</p><p className="text-[11px] text-[var(--foreground-subtle)]">مستبعد</p></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {state.activeSession ? (
        <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-[var(--gold-muted)]">الجلسة الحالية · Resume تلقائي</p>
              <h2 className="mt-2 text-lg font-semibold">Focus اختياري للمقابلة</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">الـ Focus يحدد أين نبحث عن فجوة، لكنه لا يُعامل كحقيقة ولا يمكن أن يحل محل الـ Grounding. لو السؤال الحالي مفتوح، التغيير يبدأ من السؤال التالي.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3"><strong className="block text-base" dir="ltr">{state.counts.answered}</strong>إجابة</div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3"><strong className="block text-base" dir="ltr">{state.counts.skipped}</strong>تخطي</div>
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3"><strong className="block text-base" dir="ltr">{state.counts.notRelevant}</strong>غير ذي صلة</div>
            </div>
          </div>
          <form action={setInterviewFocusAction} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="session_id" value={state.activeSession.id} />
            <input name="focus_topic" maxLength={INTERVIEW_MAX_FOCUS_CHARS} defaultValue={state.activeSession.focusTopic ?? ""} dir="auto" placeholder="مثال: فلسفتي في اختيار العملاء أو Offer validation" className="min-h-12 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--background)] px-4 text-sm outline-none focus:border-[var(--gold-muted)]" />
            <button type="submit" className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 text-sm font-semibold text-[var(--gold-bright)]">حفظ الـ Focus</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-3">
            {state.activeSession.focusTopic ? (
              <form action={setInterviewFocusAction}>
                <input type="hidden" name="session_id" value={state.activeSession.id} />
                <input type="hidden" name="focus_topic" value="" />
                <button type="submit" className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 text-xs font-medium text-[var(--foreground-muted)]">إلغاء الـ Focus</button>
              </form>
            ) : null}
            <form action={completeInterviewSessionAction}>
              <input type="hidden" name="session_id" value={state.activeSession.id} />
              <button type="submit" className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 text-xs font-medium text-[var(--foreground-muted)]">إنهاء الجلسة وحفظها في التاريخ</button>
            </form>
          </div>
        </section>
      ) : null}

      {state.extractionIssue ? (
        <section className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold">إجابة محفوظة تحتاج إعادة استخراج</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">الإجابة الخام محفوظة بالفعل. إعادة المحاولة تعيد فقط استخراج Brain drafts ولا تغيّر نص إجابتك.</p>
          <form action={retryInterviewAnswerExtractionAction} className="mt-4">
            <input type="hidden" name="answer_id" value={state.extractionIssue.answerId} />
            <button type="submit" className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] px-4 py-2 text-sm font-semibold text-[var(--gold-bright)]">إعادة استخراج التعليمات</button>
          </form>
        </section>
      ) : null}

      {!state.sessionId ? (
        <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <h2 className="text-xl font-semibold">ابدأ جلسة مقابلة جديدة</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">سيستخدم النظام Business DNA والتعليمات الحالية وإجابات المقابلات السابقة، ثم يبحث عن فجوة محددة تستحق السؤال. لن يستبدل نقص الأدلة باستبيان عام.</p>
          <form action={startInterviewAction} className="mt-5"><button type="submit" className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]">بدء جلسة جديدة</button></form>
        </section>
      ) : question ? (
        <main className="mt-6">
          <article className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-3 py-1 text-xs font-semibold text-[var(--gold-bright)]">{question.topic}</span>
              <span className="text-xs text-[var(--foreground-subtle)]" dir="ltr">Q{question.ordinal}</span>
            </div>
            <h2 className="mt-5 text-xl font-semibold leading-9 sm:text-2xl" dir="auto">{question.question}</h2>
            <details className="mt-5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
              <summary className="cursor-pointer text-sm font-semibold">لماذا أسأل هذا السؤال؟</summary>
              <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]" dir="auto">{question.whyThisQuestion}</p>
            </details>
            <form action={saveInterviewAnswerAction} className="mt-6">
              <input type="hidden" name="question_id" value={question.id} />
              <label htmlFor="interview-answer" className="text-sm font-semibold">إجابتك</label>
              <textarea id="interview-answer" name="answer" required maxLength={INTERVIEW_MAX_ANSWER_CHARS} rows={10} dir="auto" placeholder="اكتب إجابتك كما تفكر فعلاً. يمكنك استخدام العربية أو English technical terms بشكل طبيعي." className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--background)] px-4 py-3 text-sm leading-7 text-[var(--foreground)] outline-none focus:border-[var(--gold-muted)]" />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="submit" className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]">حفظ الإجابة والمتابعة</button>
                <span className="text-xs leading-5 text-[var(--foreground-subtle)]">الإجابة تُحفظ أولاً قبل أي AI extraction.</span>
              </div>
            </form>
            <div className="mt-6 grid gap-3 border-t border-[var(--border)] pt-5 lg:grid-cols-2">
              <form action={skipInterviewQuestionAction}>
                <input type="hidden" name="question_id" value={question.id} />
                <button type="submit" className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--foreground-muted)]">تخطي</button>
              </form>
              <form action={notRelevantInterviewQuestionAction} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <input type="hidden" name="question_id" value={question.id} />
                <label className="flex items-start gap-3 text-xs leading-6 text-[var(--foreground-muted)]">
                  <input type="checkbox" name="suppress_topic" className="mt-1 h-4 w-4 accent-[var(--gold-muted)]" />
                  <span>لا تسألني عن هذا الموضوع مرة أخرى</span>
                </label>
                <button type="submit" className="mt-3 min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--foreground-muted)]">غير ذي صلة</button>
              </form>
            </div>
          </article>
        </main>
      ) : (
        <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <h2 className="text-xl font-semibold">لا يوجد سؤال مفتوح حالياً</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">يمكن محاولة إيجاد فجوة جديدة في المادة الحالية. التحقق يشمل الـ Grounding وعدم التكرار اللفظي والمعنوي وحدود الـ Follow-up.</p>
          <form action={generateInterviewQuestionAction} className="mt-5"><button type="submit" className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]">إنشاء السؤال التالي</button></form>
        </section>
      )}

      <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-semibold">تاريخ المقابلات</h2>
        <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">الجلسة النشطة تُستكمل تلقائياً. إنهاء الجلسة لا يحذف أسئلتها أو إجاباتها، والجلسات السابقة تظل جزءاً من منع التكرار ومن مصادر المقابلات القادمة.</p>
        {state.recentHistory.length ? (
          <div className="mt-5 space-y-3">
            {state.recentHistory.map((item) => (
              <details key={item.id} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--gold-muted)]">{item.topic}</span>
                      <span className="text-xs text-[var(--foreground-subtle)]" dir="ltr">Q{item.ordinal}</span>
                    </div>
                    <span className="text-xs text-[var(--foreground-subtle)]">{historyStatus(item)} · {formatInterviewDate(item.createdAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--foreground-muted)]" dir="auto">{item.question}</p>
                </summary>
                <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm leading-7" dir="auto">{item.question}</p>
              </details>
            ))}
          </div>
        ) : <p className="mt-5 text-sm text-[var(--foreground-subtle)]">لا يوجد تاريخ مقابلات محفوظ حتى الآن.</p>}
      </section>
    </div>
  );
}
