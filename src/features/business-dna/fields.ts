import type { Tables } from "@/types/database";

export const MAX_FIELD_LENGTH = 4000;

export const businessDnaFieldDefinitions = [
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
] as const;

export type BusinessDnaField = (typeof businessDnaFieldDefinitions)[number]["name"];
export type BusinessDnaRow = Pick<Tables<"business_dna">, BusinessDnaField>;
export type BusinessDnaValues = Record<BusinessDnaField, string>;

export const businessDnaFieldNames = businessDnaFieldDefinitions.map(
  ({ name }) => name,
) as BusinessDnaField[];

export const BUSINESS_DNA_SELECT = businessDnaFieldNames.join(",");

export function businessDnaValuesFromRow(row: BusinessDnaRow | null): BusinessDnaValues {
  return Object.fromEntries(
    businessDnaFieldNames.map((field) => [field, row?.[field] ?? ""]),
  ) as BusinessDnaValues;
}
