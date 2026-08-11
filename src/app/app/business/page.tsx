import { BusinessDnaForm } from "@/features/business-dna/business-dna-form";
import {
  BUSINESS_DNA_SELECT,
  businessDnaValuesFromRow,
  type BusinessDnaRow,
} from "@/features/business-dna/fields";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
    .select(BUSINESS_DNA_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  const params = await searchParams;
  const status = first(params.status);

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
        <BusinessDnaForm
          initialValues={businessDnaValuesFromRow(data as BusinessDnaRow | null)}
          saved={status === "saved"}
        />
      )}
    </div>
  );
}
