export const adminNavigation = [
  {
    href: "/admin",
    label: "الرئيسية",
    description: "نقطة الدخول إلى أدوات إدارة Eslam.AI.",
  },
  {
    href: "/admin/teach",
    label: "تدريب إسلام",
    description: "أدخل تعليمات جديدة بالنص أو الصوت أو المستندات ثم حوّلها إلى Brain drafts للمراجعة.",
    children: [
      { href: "/admin/teach/text", label: "تعليم بالنص" },
      { href: "/admin/teach/voice", label: "تعليم بالصوت" },
      { href: "/admin/teach/documents", label: "تعليم بالمستندات" },
    ],
  },
  {
    href: "/admin/brain",
    label: "عقل إسلام",
    description: "راجع التعليمات ومصادرها وBrain drafts، وعدّلها واعتمدها وانشرها أو أرشفها.",
  },
] as const;

/** Future admin destinations remain addressable while unfinished, but are hidden from navigation. */
export const futureAdminSections = [
  {
    slug: "users",
    label: "المستخدمون",
    description: "إدارة حسابات المتدربين وصلاحياتهم ستُبنى في مهمة مخصصة.",
  },
  {
    slug: "conversations",
    label: "المحادثات",
    description: "مراجعة محادثات المتدربين ستُبنى في مهمة مخصصة.",
  },
  {
    slug: "memory",
    label: "ذاكرة إسلام",
    description: "إدارة طبقات الذاكرة العامة ستُبنى في مهمة مخصصة.",
  },
  {
    slug: "knowledge",
    label: "معرفة إسلام",
    description: "مصادر المعرفة والمكتبة المركزية ستُدار هنا لاحقاً.",
  },
  {
    slug: "cases",
    label: "الحالات والأمثلة",
    description: "الحالات العملية والأمثلة المعتمدة ستُدار هنا لاحقاً.",
  },
  {
    slug: "settings",
    label: "الإعدادات",
    description: "إعدادات الإدارة العامة ستظهر هنا عند تنفيذها.",
  },
] as const;

export type FutureAdminSectionSlug = (typeof futureAdminSections)[number]["slug"];

/** Resolves an unfinished direct admin section by its stable slug. */
export function getAdminSection(slug: string) {
  return futureAdminSections.find((item) => item.slug === slug);
}
