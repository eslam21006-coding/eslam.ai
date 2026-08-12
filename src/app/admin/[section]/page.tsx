import { notFound } from "next/navigation";

import { getAdminSection } from "@/features/admin-shell/navigation";

type AdminSectionPageProps = {
  params: Promise<{ section: string }>;
};

export default async function AdminSectionPage({ params }: AdminSectionPageProps) {
  const { section: slug } = await params;
  const section = getAdminSection(slug);

  if (!section) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
        <p className="text-xs font-medium text-[var(--gold-muted)]">قسم الإدارة</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{section.label}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
          {section.description}
        </p>
        <div className="mt-8 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] p-5">
          <p className="text-sm leading-7 text-[var(--foreground-subtle)]">
            هذا القسم جاهز داخل هيكل الإدارة، وسيتم تنفيذ وظيفته الفعلية في مهمته المخصصة.
          </p>
        </div>
      </div>
    </div>
  );
}
