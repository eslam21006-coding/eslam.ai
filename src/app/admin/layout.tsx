import type { ReactNode } from "react";

import { authorizeBeforeAdminRender } from "@/features/admin-shell/authorization-runtime";
import { AdminShell } from "@/features/admin-shell/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  return authorizeBeforeAdminRender(requireAdmin, () => (
    <AdminShell>{children}</AdminShell>
  ));
}
