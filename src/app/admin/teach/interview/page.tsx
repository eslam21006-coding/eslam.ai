import Link from "next/link";

import {
  generateInterviewQuestionAction,
  notRelevantInterviewQuestionAction,
  retryInterviewAnswerExtractionAction,
  saveInterviewAnswerAction,
  skipInterviewQuestionAction,
  startInterviewAction,
} from "@/features/interview-eslam/actions";
import { INTERVIEW_MAX_ANSWER_CHARS } from "@/features/interview-eslam/core";
import { loadInterviewPageState } from "@/features/interview-eslam/data";

type InterviewPageProps = { searchParams: Promise<{ notice?: string; count?: string; next?: string }> };
function noticeText(notice: string | undefined, count: string | undefined) {
  switch (notice) {
    case "started": return "بدأت المقابلة. السؤال الحالي مبني على معلومات موجودة فعلاً عن إسلام.";
    case "answer-saved": return `تم حفظ إجابتك واستخراج ${count ?? "0"} Brain draft للمراجعة، وتم تجهيز السؤال التالي.`;
    case "answer-saved-extraction-failed": return "تم حفظ إجابتك والسؤال التالي بأمان، لكن استخراج Brain drafts لم يكتمل. يمكنك إعادة المحاولة بدون كتابة الإجابة مرة أخرى.";
    case "answer-saved-needs-context": return `تم حفظ إجابتك واستخراج ${count ?? "0"} Brain draft. لم يجد النظام سؤالاً جديداً يحقق شرط الـ Grounding بدون اختراع سؤال عام.`;
    case "answer-saved-next-failed": return `تم حفظ إجابتك واستخراج ${count ?? "0"} Brain draft، لكن إنشاء السؤال التالي لم يكتمل.`;
    case "answer-saved-partial": return "تم حفظ الإجابة نفسها بأمان. تعذر جزء من المعالجة اللاحقة ويمكن إعادة المحاولة.";
    case "skipped": return "تم تخطي السؤال وحفظه في التاريخ حتى لا يعود فوراً بصياغة أخرى.";
    case "not-relevant": return "تم تسجيل السؤال كغير ذي صلة وسيتم كبح الأسئلة المشابهة.";
    case "topic-suppressed": return "تم تسجيل السؤال كغير ذي صلة وحفظ تفضيل دائم بعدم السؤال عن هذا الموضوع.";
    case "question-ready": return "تم إنشاء سؤال جديد يطابق Grounded Question Contract.";
    case "needs-context": return "لا توجد مادة كافية حالياً لإنشاء سؤال محدد ومفيد بدون الوقوع في سؤال عام. أضف أو راجع مواد تعليمية ثم حاول مرة أخرى.";
    case "extraction-complete": return `اكتمل استخراج الإجابة إلى ${count ?? "0"} Brain draft للمراجعة.`;
    case "extraction-busy": return "استخراج هذه الإجابة قيد التنفيذ بالفعل.";
    case "answer-invalid": return "اكتب إجابة غير فارغة ضمن الحد المسموح ثم حاول مرة أخرى.";
    case "answer-failed": return "لم يتم حفظ الإجابة. لم يتم تغيير السؤال الحالي.";
    case "question-failed":
    case "question-invalid": return "لم يتم تحديث حالة السؤال. أعد المحاولة.";
    case "extraction-failed":
    case "extraction-invalid": return "لم يكتمل استخراج الإجابة إلى Brain drafts. الإجابة الأصلية محفوظة ويمكن إعادة المحاولة.";
    case "start-failed": return "تعذر بدء أو استكمال جلسة المقابلة.";
    case "failed": return "تعذر إنشاء سؤال جديد حالياً. لم يتم اختراع سؤال بديل عام.";
    default: return null;
  }
}

export default async function InterviewEslamPage({ searchParams }: InterviewPageProps) {
  const params = await searchParams;
  const state = await loadInterviewPageState();
  const notice = noticeText(params.notice, params.count);
  const question = state.currentQuestion;
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-medium text-[var(--gold-muted)]">Teach Eslam · Interview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">مقابلة إسلام</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
              سؤال واحد في كل مرة. كل سؤال لازم يكون مبنياً على شيء نعرفه بالفعل عن إسلام ويستهدف فجوة محددة. إجاباتك تُحفظ كمصدر خام، وأي تعليمات مستخرجة منها تدخل عقل إسلام كمسودات للمراجعة فقط.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/teach" className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-4 py-3 text-sm font-medium text-[var(--foreground-muted)]">طرق التدريب</Link>
            <Link href="/admin/brain?status=draft&page=1" className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[var(--gold-bright)]">مراجعة Brain drafts</Link>
          </div>
        </div>
        {state.sessionId ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="حالة المقابلة الحالية">
            {[
              ["تمت الإجابة", state.counts.answered],
              ["تم التخطي", state.counts.skipped],
              ["غير ذي صلة", state.counts.notRelevant],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                <p className="text-xs text-[var(--foreground-subtle)]">{label}</p>
                <p className="mt-1 text-lg font-semibold" dir="ltr">{value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {notice ? <div className="mt-5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-7 text-[var(--foreground-muted)]" role="status">{notice}</div> : null}

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
          <h2 className="text-xl font-semibold">ابدأ مقابلة إسلام</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">سيبحث النظام أولاً في Business DNA والتعليمات الحالية ثم يقرر إن كان هناك سؤال محدد يستحق أن يُسأل. إذا لم توجد مادة كافية فلن يستبدلها باستبيان عام.</p>
          <form action={startInterviewAction} className="mt-5"><button type="submit" className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]">بدء المقابلة</button></form>
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
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">يمكن محاولة إيجاد فجوة جديدة في المادة الحالية. إذا لم توجد Grounding كافية فسيتم إيقاف العملية بدلاً من إنشاء سؤال عام.</p>
          <form action={generateInterviewQuestionAction} className="mt-5"><button type="submit" className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-5 py-3 text-sm font-semibold text-[var(--gold-bright)]">إنشاء السؤال التالي</button></form>
        </section>
      )}
    </div>
  );
}
