import { saveBusinessDnaAction } from "@/features/business-dna/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type BusinessDnaRow = {
  preferred_name: string | null;
  business_name: string | null;
  niche: string | null;
  markets: string | null;
  audiences: string | null;
  business_model: string | null;
  offers: string | null;
  price_ranges: string | null;
  positioning: string | null;
  methodology: string | null;
  delivery: string | null;
  team_context: string | null;
};

type FieldName = keyof BusinessDnaRow;

type FieldDefinition = {
  name: FieldName;
  label: string;
  hint: string;
  multiline?: boolean;
  placeholder?: string;
};

const fields: FieldDefinition[] = [
  {
    name: "preferred_name",
    label: "الاسم المفضل",
    hint: "الاسم الذي تحب أن يناديك به إسلام.",
    placeholder: "مثال: أحمد",
  },
  {
    name: "business_name",
    label: "اسم البراند أو النشاط",
    hint: "اسم المشروع أو الشركة التي نعمل عليها داخل المحادثات.",
    placeholder: "مثال: Acme Academy",
  },
  {
    name: "niche",
    label: "المجال أو التخصص",
    hint: "اشرح المجال الرئيسي الذي تعمل فيه باختصار.",
    placeholder: "مثال: تدريب القيادات للمديرين التنفيذيين",
  },
  {
    name: "markets",
    label: "الأسواق",
    hint: "الدول أو المناطق التي تبيع أو تستهدف فيها.",
    multiline: true,
    placeholder: "مثال: السعودية، الإمارات، مصر",
  },
  {
    name: "audiences",
    label: "الجمهور المستهدف",
    hint: "صف أهم شرائح العملاء الذين تخدمهم.",
    multiline: true,
    placeholder: "مثال: أصحاب الشركات، المدربون، المديرون التنفيذيون",
  },
  {
    name: "business_model",
    label: "نموذج العمل",
    hint: "كيف يحقق النشاط الإيراد بشكل عام، بدون أرقام أداء حالية.",
    multiline: true,
    placeholder: "مثال: برامج تدريبية عالية السعر + استشارات",
  },
  {
    name: "offers",
    label: "العروض الرئيسية",
    hint: "اكتب المنتجات أو الخدمات الأساسية التي تبيعها.",
    multiline: true,
    placeholder: "مثال: برنامج 12 أسبوعاً، استشارة فردية، Masterclass",
  },
  {
    name: "price_ranges",
    label: "نطاقات الأسعار",
    hint: "النطاق المعتاد لأسعار عروضك، وليس نتائج المبيعات الحالية.",
    multiline: true,
    placeholder: "مثال: 500–2,500 USD حسب العرض",
  },
  {
    name: "positioning",
    label: "الـ Positioning",
    hint: "كيف تريد أن يفهم السوق مكانتك والفرق بينك وبين البدائل.",
    multiline: true,
  },
  {
    name: "methodology",
    label: "المنهجية",
    hint: "الطريقة أو الإطار الذي تعتمد عليه في تحقيق النتيجة للعميل.",
    multiline: true,
  },
  {
    name: "delivery",
    label: "طريقة تقديم الخدمة",
    hint: "مثلاً: مباشر، مسجل، فردي، جماعي، هجين، أو تنفيذ كامل.",
    multiline: true,
  },
  {
    name: "team_context",
    label: "الفريق والسياق التشغيلي",
    hint: "أي معلومات ثابتة نسبياً عن الفريق أو القدرة التشغيلية تساعد في اتخاذ قرارات واقعية.",
    multiline: true,
  },
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function LoadError() {
  return (
    <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
      <h2 className="text-lg font-semibold">تعذر تحميل الملف التجاري</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--foreground-muted)]">
        لم نعرض نموذجاً فارغاً حتى لا يتم استبدال بيانات موجودة بالخطأ. أعد تحميل الصفحة وحاول مرة أخرى.
      </p>
    </div>
  );
}

export default async function BusinessPage({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_dna")
    .select(
      "preferred_name,business_name,niche,markets,audiences,business_model,offers,price_ranges,positioning,methodology,delivery,team_context",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const params = await searchParams;
  const status = first(params.status);
  const queryError = first(params.error);

  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:min-h-screen lg:px-10 lg:py-10">
      <header className="border-b border-[var(--border)] pb-7">
        <p lang="en" dir="ltr" className="text-xs font-medium text-[var(--foreground-subtle)]">
          Business DNA
        </p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">الملف التجاري</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)]">
          المعلومات الأساسية والثابتة نسبياً عن نشاطك، حتى يفهم إسلام سياقك من غير ما تعيده في كل محادثة.
        </p>
      </header>

      {error ? (
        <LoadError />
      ) : (
        <form action={saveBusinessDnaAction} className="mt-8 grid gap-6">
          {status === "saved" ? (
            <p role="status" className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--gold-soft)] px-4 py-3 text-sm text-[var(--gold-bright)]">
              تم حفظ الملف التجاري.
            </p>
          ) : null}

          {queryError === "invalid_input" ? (
            <p role="alert" className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]">
              أحد الحقول أطول من الحد المسموح. اختصره ثم حاول مرة أخرى.
            </p>
          ) : null}

          {queryError === "save_failed" ? (
            <p role="alert" className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground-muted)]">
              تعذر حفظ الملف التجاري. لم يتم تأكيد أي تغيير، حاول مرة أخرى.
            </p>
          ) : null}

          <section className="grid gap-5 md:grid-cols-2">
            {fields.map((field) => {
              const value = (data as BusinessDnaRow | null)?.[field.name] ?? "";
              const inputClassName =
                "mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)]";

              return (
                <label
                  key={field.name}
                  className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 ${field.multiline ? "md:col-span-2" : ""}`}
                >
                  <span className="block text-sm font-semibold">{field.label}</span>
                  <span className="mt-1 block text-xs leading-6 text-[var(--foreground-subtle)]">{field.hint}</span>
                  {field.multiline ? (
                    <textarea
                      name={field.name}
                      defaultValue={value}
                      maxLength={4000}
                      rows={4}
                      placeholder={field.placeholder}
                      className={`${inputClassName} resize-y`}
                    />
                  ) : (
                    <input
                      type="text"
                      name={field.name}
                      defaultValue={value}
                      maxLength={4000}
                      placeholder={field.placeholder}
                      className={inputClassName}
                    />
                  )}
                </label>
              );
            })}
          </section>

          <aside className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] p-5">
            <p className="text-sm font-medium">ما الذي لا يوضع هنا؟</p>
            <p className="mt-2 text-xs leading-6 text-[var(--foreground-subtle)]">
              أرقام الحملات والنتائج التي تتغير مع الوقت لا تعتبر جزءاً من Business DNA. سيتم حفظها لاحقاً كبيانات مؤرخة مرتبطة بالسياق الصحيح بدلاً من استبدالها هنا.
            </p>
          </aside>

          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-12 rounded-[var(--radius-sm)] border border-[var(--gold)] bg-[var(--gold)] px-6 text-sm font-semibold text-black transition-opacity hover:opacity-90"
            >
              حفظ الملف التجاري
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
