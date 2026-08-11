export default function BusinessPage() {
  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:min-h-screen lg:px-10 lg:py-10">
      <header className="border-b border-[var(--border)] pb-7">
        <p className="text-xs font-medium text-[var(--foreground-subtle)]">Business DNA</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">الملف التجاري</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
          هنا هتكون المعلومات الأساسية والثابتة نسبياً عن نشاطك، عشان إسلام يفهم سياقك من غير ما تعيده في كل محادثة.
        </p>
      </header>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
          <div className="grid size-11 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--gold-soft)] text-[var(--gold-bright)]">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 20V8.5L12 4l8 4.5V20" />
              <path d="M8 20v-6h8v6" />
            </svg>
          </div>
          <h2 className="mt-5 text-xl font-semibold">لسه مفيش ملف تجاري</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--foreground-muted)]">
            هتقدر تضيف البراند، السوق، الجمهور، العروض، الأسعار، الـ positioning وطريقة تقديم الخدمة من هنا.
          </p>
          <div className="mt-7 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] p-5">
            <p className="text-sm font-medium">إعداد الملف التجاري هيكون متاح قريباً.</p>
            <p className="mt-2 text-xs leading-6 text-[var(--foreground-subtle)]">
              المعلومات هنا هتكون ثابتة نسبياً، بينما أرقام الحملات والنتائج المتغيرة تفضل مرتبطة بالمحادثات والسياق الحالي.
            </p>
          </div>
        </div>

        <aside className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-6 sm:p-7">
          <p className="text-xs font-semibold text-[var(--gold-bright)]">ماذا سيعرف إسلام؟</p>
          <ul className="mt-5 grid gap-4 text-sm text-[var(--foreground-muted)]">
            {[
              "النشاط والبراند",
              "الأسواق والجمهور",
              "العروض ونطاق الأسعار",
              "الـ positioning والمنهجية",
              "طريقة تقديم الخدمة والفريق",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--gold-muted)]" />
                <span className="leading-6">{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
