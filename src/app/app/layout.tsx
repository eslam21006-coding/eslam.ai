import type { ReactNode } from "react";

import { AppShell } from "@/features/app-shell/app-shell";

export default function MenteeAppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
