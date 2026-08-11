import Link from "next/link";

import { loginAction, signupAction } from "@/features/auth/actions";

type AuthMode = "login" | "signup";

type AuthCardProps = {
  mode: AuthMode;
  message?: string | null;
};

export function AuthCard({ mode, message }: AuthCardProps) {
  const isLogin = mode === "login";
  const action = isLogin ? loginAction : signupAction;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
      <section className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <div className="mb-8 text-center">
          <p lang="en" dir="ltr" className="text-sm font-semibold tracking-[0.22em] text-[var(--gold-bright)]">
            ESLAM.AI
          </p>
          <h1 className="mt-4 text-2xl font-semibold">{isLogin ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            {isLogin ? "ادخل إلى مساحة الإرشاد الخاصة بك." : "ابدأ مساحة الإرشاد الخاصة بك."}
          </p>
        </div>

        {message ? (
          <p role="status" className="mb-5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]">
            {message}
          </p>
        ) : null}

        <form action={action} className="grid gap-5">
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--foreground-muted)]">البريد الإلكتروني</span>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              dir="ltr"
              className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 text-left text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]"
              placeholder="name@example.com"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="text-[var(--foreground-muted)]">كلمة المرور</span>
            <input
              required
              type="password"
              name="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? 6 : 8}
              dir="ltr"
              className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 text-left text-[var(--foreground)]"
            />
          </label>

          <button
            type="submit"
            className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold)] bg-[var(--gold)] px-5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            {isLogin ? "دخول" : "إنشاء الحساب"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">
          {isLogin ? "ليس لديك حساب؟" : "لديك حساب بالفعل؟"}{" "}
          <Link href={isLogin ? "/auth/signup" : "/auth/login"} className="text-[var(--gold-bright)] underline-offset-4 hover:underline">
            {isLogin ? "إنشاء حساب" : "تسجيل الدخول"}
          </Link>
        </p>
      </section>
    </main>
  );
}
