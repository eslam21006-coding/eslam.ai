import Link from "next/link";

import { adminNavigation } from "@/features/admin-shell/navigation";

export default function AdminHomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="max-w-3xl">
        <p className="text-xs font-medium text-[var(--gold-muted)]">لوحة الإدارة</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">إدارة Eslam.AI</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
          هذه هي نقطة الدخول لكل أدوات الإدارة. الوظائف نفسها ستُفعّل تدريجياً في المهام التالية.
        </p>
      </div>

      <section aria-labelledby="admin-sections" className="mt-9">
        <h2 id="admin-sections" className="sr-only">أقسام الإدارة</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {adminNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group min-h-36 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--gold-muted)] hover:bg-[var(--surface-subtle)]"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-[var(--foreground)] group-hover:text-[var(--gold-bright)]">
                  {item.label}
                </h3>
                <span aria-hidden="true" className="text-[var(--gold-muted)]">←</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--foreground-subtle)]">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
