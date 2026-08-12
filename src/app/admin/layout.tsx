import type { ReactNode } from "react";

import { AdminShell } from "@/features/admin-shell/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return <AdminShell>{children}</AdminShell>;
}
