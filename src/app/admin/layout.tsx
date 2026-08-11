import type { ReactNode } from "react";

import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
