export default function AdminAuthorizationProbePage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-12 text-[var(--foreground)]">
      <div className="mx-auto max-w-2xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8">
        <p className="text-xs font-medium text-[var(--foreground-subtle)]" lang="en" dir="ltr">
          Admin Authorization
        </p>
        <h1 className="mt-3 text-2xl font-semibold">تم التحقق من صلاحية الإدارة</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--foreground-muted)]">
          هذه صفحة تحقق مؤقتة فقط. واجهة الإدارة نفسها ستُبنى في المهمة التالية.
        </p>
      </div>
    </main>
  );
}
