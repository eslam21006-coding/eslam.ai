import Link from "next/link";

const teachingMethods = [
  {
    href: "/admin/teach/text",
    eyebrow: "Text",
    title: "تعليم بالنص",
    description: "اكتب مبدأ أو Playbook أو تعليم مباشر، واحفظه كـ Brain draft للمراجعة والنشر.",
    flow: "Text → Brain draft",
  },
  {
    href: "/admin/teach/voice",
    eyebrow: "Voice",
    title: "تعليم بالصوت",
    description: "سجّل بصوتك، حوّل التسجيل إلى Transcript، ثم راجع الـ candidates قبل إنشاء Brain drafts.",
    flow: "Record → Transcribe → Extract",
  },
  {
    href: "/admin/teach/documents",
    eyebrow: "Documents",
    title: "تعليم بالمستندات",
    description: "ارفع مستنداً خاصاً، استخرج Teachings مع مصدرها، ثم اختر ما يتحول إلى Brain drafts.",
    flow: "Upload → Extract → Review",
  },
] as const;

export default function TeachEslamHubPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="max-w-3xl">
        <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Training</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">تدريب إسلام</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
          اختر طريقة إدخال التعليم. كل المسارات تنتهي في Brain drafts قابلة للمراجعة؛ لا يصبح أي تعليم فعالاً في المحادثات إلا بعد النشر الصريح.
        </p>
      </div>

      <section className="mt-9 grid gap-4 lg:grid-cols-3" aria-label="طرق تدريب إسلام">
        {teachingMethods.map((method) => (
          <Link
            key={method.href}
            href={method.href}
            className="group flex min-h-64 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 transition-colors hover:border-[var(--gold-muted)] hover:bg-[var(--surface-subtle)]"
          >
            <p lang="en" dir="ltr" className="text-xs font-semibold tracking-[0.16em] text-[var(--gold-muted)]">
              {method.eyebrow}
            </p>
            <div className="mt-4 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold group-hover:text-[var(--gold-bright)]">{method.title}</h2>
              <span aria-hidden="true" className="text-[var(--gold-muted)]">←</span>
            </div>
            <p className="mt-4 flex-1 text-sm leading-7 text-[var(--foreground-muted)]">{method.description}</p>
            <p lang="en" dir="ltr" className="mt-6 border-t border-[var(--border)] pt-4 text-xs text-[var(--foreground-subtle)]">
              {method.flow}
            </p>
          </Link>
        ))}
      </section>

      <aside className="mt-6 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">بعد إنشاء المسودات</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--foreground-muted)]">
            راجع المحتوى وعدّله واعتمد النسخة الصحيحة من مركز عقل إسلام.
          </p>
        </div>
        <Link
          href="/admin/brain?status=draft&page=1"
          className="min-h-11 shrink-0 rounded-[var(--radius-sm)] border border-[var(--gold-muted)] bg-[var(--gold-soft)] px-4 py-3 text-center text-sm font-semibold text-[var(--gold-bright)] transition hover:border-[var(--gold)]"
        >
          فتح عقل إسلام
        </Link>
      </aside>
    </div>
  );
}
