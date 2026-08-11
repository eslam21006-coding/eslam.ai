"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

const navigation = [
  { href: "/app/chat", label: "محادثة جديدة", icon: "chat" },
  { href: "/app/business", label: "الملف التجاري", icon: "business" },
] as const;

const recentConversations = [
  "مراجعة أداء الـ Webinar",
  "ارتفاع تكلفة الـ Meta Ads",
  "تحسين عرض البرنامج",
] as const;

function NavIcon({ name }: { name: "chat" | "business" }) {
  if (name === "business") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 20V8.5L12 4l8 4.5V20" />
        <path d="M8 20v-6h8v6M8 10h.01M12 10h.01M16 10h.01" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 5.5h14v10H9l-4 3v-13Z" />
      <path d="M9 10.5h6" />
    </svg>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--border)] px-5 py-6">
        <Link href="/app/chat" onClick={onNavigate} className="inline-flex items-baseline gap-2" aria-label="Eslam.AI — المحادثة">
          <span lang="en" dir="ltr" className="text-lg font-semibold tracking-[0.18em] text-[var(--gold-bright)]">
            ESLAM.AI
          </span>
        </Link>
        <p className="mt-2 text-xs text-[var(--foreground-subtle)]">مستشارك الذكي</p>
      </div>

      <nav aria-label="التنقل الرئيسي" className="grid gap-1 px-3 py-4">
        {navigation.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm transition-colors ${
                active
                  ? "bg-[var(--gold-soft)] text-[var(--gold-bright)]"
                  : "text-[var(--foreground-muted)] hover:bg-white/[0.03] hover:text-[var(--foreground)]"
              }`}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div id="conversations" className="min-h-0 flex-1 border-t border-[var(--border)] px-3 py-4">
        <div className="flex items-center justify-between px-3">
          <p className="text-xs font-medium text-[var(--foreground-subtle)]">المحادثات السابقة</p>
          <span aria-hidden="true" className="text-xs text-[var(--foreground-subtle)]">•••</span>
        </div>
        <div className="mt-2 grid gap-1">
          {recentConversations.map((title) => (
            <Link
              key={title}
              href="/app/chat"
              onClick={onNavigate}
              className="truncate rounded-[var(--radius-sm)] px-3 py-2.5 text-sm text-[var(--foreground-muted)] transition-colors hover:bg-white/[0.03] hover:text-[var(--foreground)]"
            >
              {title}
            </Link>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--gold-soft)] text-sm font-semibold text-[var(--gold-bright)]">
            إ
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">حساب المتدرب</p>
            <p className="truncate text-xs text-[var(--foreground-subtle)]">Eslam.AI</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mobileMenuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (mobileMenuRef.current?.open) {
      mobileMenuRef.current.close();
    }
  }, [pathname]);

  const openMobileMenu = () => mobileMenuRef.current?.showModal();
  const closeMobileMenu = () => mobileMenuRef.current?.close();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="fixed inset-y-0 right-0 z-20 hidden w-72 border-l border-[var(--border)] bg-[var(--surface)] lg:block">
        <SidebarContent />
      </aside>

      <dialog
        ref={mobileMenuRef}
        aria-label="قائمة التنقل"
        className="fixed inset-y-0 right-0 m-0 h-dvh max-h-none w-[min(20rem,88vw)] max-w-none border-0 border-l border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--foreground)] shadow-[var(--shadow-soft)] backdrop:bg-black/75 lg:hidden"
      >
        <div className="relative h-full">
          <button
            type="button"
            onClick={closeMobileMenu}
            aria-label="إغلاق القائمة"
            className="absolute left-3 top-4 z-10 grid size-11 place-items-center rounded-full text-[var(--foreground-muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]"
          >
            <span aria-hidden="true" className="text-xl">×</span>
          </button>
          <SidebarContent onNavigate={closeMobileMenu} />
        </div>
      </dialog>

      <div className="lg:pr-72">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_92%,transparent)] px-4 backdrop-blur-xl lg:hidden">
          <Link href="/app/chat" lang="en" dir="ltr" className="text-sm font-semibold tracking-[0.18em] text-[var(--gold-bright)]">
            ESLAM.AI
          </Link>
          <button
            type="button"
            onClick={openMobileMenu}
            aria-label="فتح القائمة"
            className="grid size-11 place-items-center rounded-full border border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </button>
        </header>

        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
