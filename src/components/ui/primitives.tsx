import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border border-[var(--border-strong)] bg-[var(--gold)] text-[#11100d] hover:bg-[var(--gold-bright)]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--foreground)] hover:border-[var(--border-strong)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--gold-soft)] hover:text-[var(--foreground)]",
  danger:
    "border border-[color-mix(in_srgb,var(--danger)_38%,transparent)] bg-transparent text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
};

export function Button({
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Surface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)] ${className}`}
    >
      {children}
    </section>
  );
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-start text-sm text-[var(--foreground)] caret-[var(--gold)] placeholder:text-[var(--foreground-subtle)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--gold-muted)] ${className}`}
      {...props}
    />
  );
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-28 w-full resize-y rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-3 text-start text-sm leading-7 text-[var(--foreground)] caret-[var(--gold)] placeholder:text-[var(--foreground-subtle)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--gold-muted)] ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-[var(--foreground)]">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-[var(--foreground-subtle)]">{hint}</span> : null}
    </label>
  );
}

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--gold-soft)] px-2.5 py-1 text-xs font-medium text-[var(--gold-bright)]">
      {children}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-[rgba(246,241,232,0.07)] ${className}`}
    />
  );
}

export function Notice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--gold-soft)] p-4"
    >
      <p className="text-sm font-semibold text-[var(--gold-bright)]">{title}</p>
      <div className="mt-1.5 text-sm leading-6 text-[var(--foreground-muted)]">{children}</div>
    </div>
  );
}

export function DropdownPreview() {
  return (
    <details className="group relative w-full max-w-64">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 text-sm text-[var(--foreground)] marker:hidden hover:border-[var(--border-strong)]">
        <span>اختيار</span>
        <span aria-hidden="true" className="text-[var(--gold)] transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="absolute z-10 mt-2 grid w-full gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-soft)]">
        <button type="button" className="min-h-11 rounded-lg px-3 py-2 text-start text-sm text-[var(--foreground-muted)] hover:bg-[var(--gold-soft)] hover:text-[var(--foreground)]">
          الاختيار الأول
        </button>
        <button type="button" className="min-h-11 rounded-lg px-3 py-2 text-start text-sm text-[var(--foreground-muted)] hover:bg-[var(--gold-soft)] hover:text-[var(--foreground)]">
          الاختيار الثاني
        </button>
      </div>
    </details>
  );
}

export function DialogPreview() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 h-px w-10 bg-[var(--gold)]" />
      <h3 className="text-lg font-semibold">تأكيد الإجراء</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--foreground-muted)]">
        هذا نموذج بصري لنافذة الحوار. السلوك التفاعلي يُضاف فقط عندما تحتاجه ميزة فعلية.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button>تأكيد</Button>
        <Button variant="ghost">إلغاء</Button>
      </div>
    </div>
  );
}

export function ToastPreview() {
  return (
    <div
      role="status"
      className="flex max-w-sm items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-soft)]"
    >
      <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-[var(--success)]" />
      <div>
        <p className="text-sm font-semibold">تم الحفظ</p>
        <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">تم حفظ التغييرات بنجاح.</p>
      </div>
    </div>
  );
}
