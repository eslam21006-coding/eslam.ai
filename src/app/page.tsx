import Link from "next/link";

import { StatusPill } from "@/components/ui/primitives";

export default function HomePage() {
  return (
    <main className="surface-grid flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
      <section className="w-full max-w-4xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center shadow-[var(--shadow-soft)] sm:px-12 sm:py-16">
        <div className="mx-auto mb-7 h-px w-14 bg-[var(--gold)]" />
        <StatusPill>الهوية البصرية التأسيسية</StatusPill>
        <p dir="ltr" className="mt-7 text-sm font-semibold tracking-[0.32em] text-[var(--gold)]">
          ESLAM.AI
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          إرشاد واضح. بدون ضوضاء.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
          أساس بصري عربي فاخر للتجربة القادمة: أسود عميق، ذهبي هادئ، وواجهة تعطي الأولوية للمحادثة والتركيز.
        </p>
        <Link
          href="/design-system"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--gold)] px-5 py-2.5 text-sm font-semibold text-[#11100d] transition-colors hover:bg-[var(--gold-bright)]"
        >
          فتح مرجع التصميم
        </Link>
      </section>
    </main>
  );
}
