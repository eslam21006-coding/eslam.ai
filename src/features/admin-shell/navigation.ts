export const adminNavigation = [
  {
    href: "/admin",
    label: "الرئيسية",
    description: "نقطة الدخول إلى أدوات إدارة Eslam.AI.",
  },
  {
    href: "/admin/teach",
    label: "تدريب إسلام",
    description: "أدخل تعليمات جديدة بالنص أو الصوت أو المستندات أو المقابلة ثم حوّلها إلى Brain drafts للمراجعة.",
    children: [
      { href: "/admin/teach/text", label: "تعليم بالنص" },
      { href: "/admin/teach/voice", label: "تعليم بالصوت" },
      { href: "/admin/teach/documents", label: "مستندات تعليمية" },
      { href: "/admin/teach/interview", label: "مقابلة إسلام" },
    ],
  },
  {
    href: "/admin/brain",
    label: "عقل إسلام",
    description: "راجع التعليمات ومصادرها وBrain drafts، وعدّلها واعتمدها وانشرها أو أرشفها.",
  },
  {
    href: "/admin/knowledge",
    label: "مكتبة المعرفة",
    description: "أضف المراجع التي يبحث فيها إسلام عند الحاجة من غير تحويلها تلقائياً إلى تعليمات داخل العقل.",
  },
] as const;

/** Admin destinations that stay hidden until their product workflows exist. */
export const futureAdminSections = [
  { slug: "users", label: "المستخدمون", description: "إدارة حسابات المتدربين وصلاحياتهم." },
  { slug: "conversations", label: "المحادثات", description: "مراجعة محادثات المتدربين." },
  { slug: "memory", label: "ذاكرة إسلام", description: "إدارة طبقات الذاكرة العامة." },
  { slug: "cases", label: "الحالات والأمثلة", description: "إدارة الحالات العملية والأمثلة المعتمدة." },
  { slug: "settings", label: "الإعدادات", description: "إعدادات الإدارة العامة." },
] as const;

export type FutureAdminSectionSlug = (typeof futureAdminSections)[number]["slug"];
/** Resolves an unfinished direct admin section by its stable slug. */
export function getAdminSection(slug: string) {
  return futureAdminSections.find((item) => item.slug === slug);
}
