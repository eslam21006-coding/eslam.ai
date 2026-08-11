const messages = [
  {
    role: "user",
    body: "صرفت 3000 دولار على الـ Webinar ومبعناش غير اتنين. مش فاهم المشكلة فين.",
  },
  {
    role: "assistant",
    body: "تمام. مبلغ الـ spend لوحده مش هيقوللي المشكلة فين. كام واحد سجل في الـ Webinar، وكام واحد منهم حضر فعلياً؟",
  },
] as const;

export default function ChatPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-4 sm:px-6 lg:min-h-screen lg:px-8">
      <header className="flex min-h-20 items-center border-b border-[var(--border)] py-4">
        <div>
          <p className="text-xs font-medium text-[var(--foreground-subtle)]">محادثة جديدة</p>
          <h1 className="mt-1 text-lg font-semibold sm:text-xl">اتكلم مع إسلام</h1>
        </div>
      </header>

      <section aria-label="المحادثة" className="flex flex-1 flex-col justify-end py-8 sm:py-12">
        <div className="mx-auto grid w-full max-w-3xl gap-7">
          <div className="pb-3 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--gold-soft)] text-lg font-semibold text-[var(--gold-bright)]">
              إ
            </div>
            <h2 className="mt-4 text-xl font-semibold sm:text-2xl">إيه اللي شاغلك دلوقتي؟</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-[var(--foreground-muted)]">
              احكي الوضع بطريقتك. مش محتاج تملأ نموذج أو تختار أداة.
            </p>
          </div>

          <div className="grid gap-6">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "mr-auto max-w-[88%] sm:max-w-[75%]" : "max-w-[92%] sm:max-w-[82%]"}
              >
                <div
                  className={
                    message.role === "user"
                      ? "rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3.5"
                      : "px-1 py-1"
                  }
                >
                  <p className="text-mixed text-sm leading-7 sm:text-[0.95rem]">{message.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="sticky bottom-0 pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl rounded-[1.4rem] border border-[var(--border-strong)] bg-[var(--surface)] p-2 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
          <textarea
            aria-label="رسالتك"
            placeholder="اكتب لإسلام..."
            rows={2}
            className="block min-h-16 w-full resize-none bg-transparent px-3 py-2 text-sm leading-7 text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]"
          />
          <div className="flex items-center justify-between gap-3 px-1 pb-1">
            <button
              type="button"
              aria-label="إضافة مرفق"
              className="grid size-11 place-items-center rounded-full text-xl text-[var(--foreground-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--foreground)]"
            >
              <span aria-hidden="true">+</span>
            </button>
            <button
              type="button"
              disabled
              aria-label="إرسال الرسالة"
              className="grid size-11 place-items-center rounded-full bg-[var(--gold)] text-[#11100d] opacity-50 disabled:cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="m5 12 14-7-4 14-3-6-7-1Z" />
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
