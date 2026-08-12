"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { logoutAction } from "@/features/auth/actions";
import { adminNavigation } from "@/features/admin-shell/navigation";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--border)] px-5 py-6">
        <Link href="/admin" onClick={onNavigate} className="inline-flex items-baseline gap-2" aria-label="Eslam.AI — الإدارة">
          <span lang="en" dir="ltr" className="text-lg font-semibold tracking-[0.18em] text-[var(--gold-bright)]">
            ESLAM.AI
          </span>
        </Link>
        <p className="mt-2 text-xs text-[var(--foreground-subtle)]">لوحة الإدارة</p>
      </div>

      <nav aria-label="تنقل الإدارة" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="grid gap-1">
          {adminNavigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-[var(--radius-sm)] border-r-2 px-3 text-sm transition-colors ${
                  active
                    ? "border-[var(--gold-muted)] bg-[var(--gold-soft)] text-[var(--gold-bright)]"
                    : "border-transparent text-[var(--foreground-muted)] hover:bg-white/[0.03] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-[var(--border)] p-4">
        <Link
          href="/app/chat"
          className="flex min-h-11 items-center rounded-[var(--radius-sm)] px-3 text-sm text-[var(--foreground-muted)] transition-colors hover:bg-white/[0.03] hover:text-[var(--foreground)]"
        >
          العودة إلى مساحة المتدرب
        </Link>
        <form action={logoutAction} className="mt-2">
          <button
            type="submit"
            className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-sm text-[var(--foreground-muted)] transition-colors hover:border-[var(--gold-muted)] hover:text-[var(--foreground)]"
          >
            تسجيل الخروج
          </button>
        </form>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mobileMenuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (mobileMenuRef.current?.open) mobileMenuRef.current.close();
  }, [pathname]);

  useEffect(() => {
    const desktopBreakpoint = window.matchMedia("(min-width: 64rem)");
    const closeAtDesktop = () => {
      if (desktopBreakpoint.matches && mobileMenuRef.current?.open) {
        mobileMenuRef.current.close();
      }
    };

    closeAtDesktop();
    desktopBreakpoint.addEventListener("change", closeAtDesktop);
    return () => desktopBreakpoint.removeEventListener("change", closeAtDesktop);
  }, []);

  const openMobileMenu = () => mobileMenuRef.current?.showModal();
  const closeMobileMenu = () => mobileMenuRef.current?.close();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="fixed inset-y-0 right-0 z-20 hidden w-72 border-l border-[var(--border)] bg-[var(--surface)] lg:block">
        <SidebarContent />
      </aside>

      <dialog
        ref={mobileMenuRef}
        aria-label="قائمة الإدارة"
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
          <Link href="/admin" lang="en" dir="ltr" className="text-sm font-semibold tracking-[0.18em] text-[var(--gold-bright)]">
            ESLAM.AI
          </Link>
          <button
            type="button"
            onClick={openMobileMenu}
            aria-label="فتح قائمة الإدارة"
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
