import type { ReactNode } from "react";

import { AppShell } from "@/features/app-shell/app-shell";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function MenteeAppLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedUser();
  return <AppShell>{children}</AppShell>;
}
