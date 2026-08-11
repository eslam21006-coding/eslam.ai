import { ConversationComposer } from "@/features/conversations/conversation-composer";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ChatPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = first(params.error);
  const recoveryMessage =
    error === "logout_failed"
      ? "تعذر تسجيل الخروج الآن. حاول مرة أخرى."
      : error === "profile_init_failed"
        ? "تعذر تجهيز حسابك بالكامل. حاول تسجيل الخروج ثم تسجيل الدخول مرة أخرى."
        : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-4 sm:px-6 lg:min-h-screen lg:px-8">
      <header className="flex min-h-20 items-center border-b border-[var(--border)] py-4">
        <div>
          <p className="text-xs font-medium text-[var(--foreground-subtle)]">محادثة جديدة</p>
          <h1 className="mt-1 text-lg font-semibold sm:text-xl">اتكلم مع إسلام</h1>
        </div>
      </header>

      {recoveryMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
        >
          {recoveryMessage}
        </p>
      ) : null}

      <section aria-label="محادثة جديدة" className="flex flex-1 items-center py-10 sm:py-14">
        <div className="mx-auto w-full max-w-3xl text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--gold-soft)] text-lg font-semibold text-[var(--gold-bright)]">
            إ
          </div>
          <h2 className="mt-4 text-xl font-semibold sm:text-2xl">إيه اللي شاغلك دلوقتي؟</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-[var(--foreground-muted)]">
            احكي الوضع بطريقتك. أول رسالة هتبدأ محادثة محفوظة تقدر ترجع لها بعدين.
          </p>
        </div>
      </section>

      <footer className="sticky bottom-0 pb-4 pt-2 sm:pb-6">
        <ConversationComposer />
      </footer>
    </div>
  );
}
