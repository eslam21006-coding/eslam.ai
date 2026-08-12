export const adminNavigation = [
  {
    slug: "users",
    href: "/admin/users",
    label: "المستخدمون",
    description: "إدارة حسابات المتدربين وصلاحياتهم لاحقاً.",
  },
  {
    slug: "conversations",
    href: "/admin/conversations",
    label: "المحادثات",
    description: "مراجعة محادثات المتدربين في مهمة لاحقة.",
  },
  {
    slug: "teach",
    href: "/admin/teach",
    label: "Teach Eslam",
    description: "اكتب تعليماً نصياً جديداً واحفظه كمسودة ثم انشره بشكل صريح.",
  },
  {
    slug: "memory",
    href: "/admin/memory",
    label: "ذاكرة إسلام",
    description: "إدارة طبقات الذاكرة العامة ستُبنى في مهام لاحقة.",
  },
  {
    slug: "brain",
    href: "/admin/brain",
    label: "عقل إسلام",
    description: "راجع التعليمات ومصادرها، عدّل المسودات، اعتمدها، انشرها أو أرشفها.",
  },
  {
    slug: "knowledge",
    href: "/admin/knowledge",
    label: "معرفة إسلام",
    description: "مصادر المعرفة والمكتبة المركزية ستُدار هنا لاحقاً.",
  },
  {
    slug: "cases",
    href: "/admin/cases",
    label: "الحالات والأمثلة",
    description: "الحالات العملية والأمثلة المعتمدة ستُدار هنا لاحقاً.",
  },
  {
    slug: "settings",
    href: "/admin/settings",
    label: "الإعدادات",
    description: "إعدادات الإدارة العامة ستظهر هنا عند تنفيذها.",
  },
] as const;

export type AdminSectionSlug = (typeof adminNavigation)[number]["slug"];

export function getAdminSection(slug: string) {
  return adminNavigation.find((item) => item.slug === slug);
}
