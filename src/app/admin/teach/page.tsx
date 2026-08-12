import { TeachEslamForm } from "@/features/teach-eslam/teach-eslam-form";

type TeachEslamPageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function TeachEslamPage({ searchParams }: TeachEslamPageProps) {
  const { status } = await searchParams;
  const publishStatus =
    status === "published" || status === "publish-failed" || status === "publish-invalid"
      ? status
      : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
        <p className="text-xs font-medium text-[var(--gold-muted)]">Admin · Text teaching</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight" dir="ltr">
          Teach Eslam
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] sm:text-base">
          اكتب ما تريد أن يعرفه أو يطبقه Eslam.AI. كل تعليم يبدأ كمسودة ثابتة، ثم يحتاج إلى نشر صريح قبل أن يصبح جزءاً من عقل إسلام المستخدم في المحادثات.
        </p>

        <TeachEslamForm publishStatus={publishStatus} />
      </div>
    </div>
  );
}
