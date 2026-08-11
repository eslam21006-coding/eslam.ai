import Link from "next/link";

import {
  Button,
  DialogPreview,
  DropdownPreview,
  Field,
  Notice,
  Skeleton,
  StatusPill,
  Surface,
  TextArea,
  TextInput,
  ToastPreview,
} from "@/components/ui/primitives";

const swatches = [
  ["الخلفية", "var(--background)"],
  ["السطح", "var(--surface)"],
  ["السطح المرتفع", "var(--surface-raised)"],
  ["الذهبي", "var(--gold)"],
  ["الذهبي الفاتح", "var(--gold-bright)"],
  ["النص", "var(--foreground)"],
] as const;

export default function DesignSystemPage() {
  return (
    <main className="surface-grid min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-6 border-b border-[var(--border)] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <StatusPill>مرجع داخلي</StatusPill>
            <p lang="en" dir="ltr" className="mt-5 text-sm font-semibold tracking-[0.28em] text-[var(--gold)]">
              ESLAM.AI
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">نظام التصميم</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
              مرجع بصري للهوية العربية الفاخرة: أسود عميق، ذهبي هادئ، تباين مريح، ومساحات واسعة بدون ضوضاء بصرية.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-[var(--gold-bright)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--foreground)]"
          >
            العودة للرئيسية
          </Link>
        </header>

        <div className="mt-10 grid gap-8">
          <Surface className="p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold tracking-[0.16em] text-[var(--gold)]">الأساس</p>
              <h2 className="mt-2 text-xl font-semibold sm:text-2xl">الألوان والسطوح</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {swatches.map(([label, color]) => (
                <div key={label} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                  <div className="h-20 rounded-lg border border-white/5" style={{ background: color }} />
                  <p className="mt-3 text-sm font-medium">{label}</p>
                </div>
              ))}
            </div>
          </Surface>

          <Surface className="p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-[var(--gold)]">الطباعة</p>
                <h2 className="mt-2 text-xl font-semibold sm:text-2xl">الخط واتجاه النص</h2>
                <div className="mt-6 space-y-4">
                  <p className="text-3xl font-semibold leading-tight sm:text-5xl">إسلام يفهم السياق قبل ما ينصحك.</p>
                  <p className="max-w-2xl text-base leading-8 text-[var(--foreground-muted)]">
                    الهدف هو قراءة عربية مريحة مع مصطلحات العمل الطبيعية مثل Meta Ads و Webinar و Funnel بدون تشويه اتجاه النص.
                  </p>
                  <p className="text-mixed rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm leading-7">
                    الـ CPL ارتفع من <bdi dir="ltr">$8</bdi> إلى <bdi dir="ltr">$18</bdi> خلال <bdi dir="ltr">3 days</bdi> — قبل ما نغيّر الـ creatives لازم نبص على الـ CPA والـ lead quality.
                  </p>
                </div>
              </div>
              <div className="grid content-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-subtle)] p-5">
                <span className="text-xs text-[var(--foreground-subtle)]">التدرج البصري</span>
                <span className="text-2xl font-semibold">عنوان رئيسي</span>
                <span className="text-lg font-semibold">عنوان فرعي</span>
                <span className="text-sm leading-6 text-[var(--foreground-muted)]">نص مساعد واضح وهادئ بدون تباين مبالغ فيه.</span>
              </div>
            </div>
          </Surface>

          <Surface className="p-6 sm:p-8">
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--gold)]">عناصر التحكم</p>
            <h2 className="mt-2 text-xl font-semibold sm:text-2xl">الأزرار والحقول</h2>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button>إجراء رئيسي</Button>
              <Button variant="secondary">إجراء ثانوي</Button>
              <Button variant="ghost">إجراء هادئ</Button>
              <Button variant="danger">حذف</Button>
              <Button disabled>غير متاح</Button>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <Field label="اسم النشاط" hint="معلومة ثابتة نسبيًا داخل الملف التجاري.">
                <TextInput placeholder="مثال: Adscope" />
              </Field>
              <Field label="ملاحظة">
                <TextInput placeholder="اكتب هنا..." />
              </Field>
              <div className="lg:col-span-2">
                <Field label="السياق">
                  <TextArea placeholder="اشرح الوضع باختصار..." />
                </Field>
              </div>
            </div>
          </Surface>

          <div className="grid gap-8 lg:grid-cols-2">
            <Surface className="p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-[0.16em] text-[var(--gold)]">الطبقات</p>
              <h2 className="mt-2 text-xl font-semibold sm:text-2xl">القوائم والنوافذ</h2>
              <div className="mt-6 grid gap-8">
                <DropdownPreview />
                <DialogPreview />
              </div>
            </Surface>

            <Surface className="p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-[0.16em] text-[var(--gold)]">التغذية الراجعة</p>
              <h2 className="mt-2 text-xl font-semibold sm:text-2xl">الحالات والتنبيهات</h2>
              <div className="mt-6 grid gap-5">
                <Notice title="معلومة مهمة">هذا النمط مخصص للتوضيح بدون خلق إحساس بالخطر أو الإزعاج.</Notice>
                <ToastPreview />
                <div className="grid gap-3" aria-label="مثال تحميل">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </main>
  );
}
