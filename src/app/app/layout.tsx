import type { ReactNode } from "react";

import { AppShell } from "@/features/app-shell/app-shell";
import { listConversations } from "@/features/conversations/data";
import { isAdmin } from "@/lib/auth/admin";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function MenteeAppLayout({ children }: { children: ReactNode }) {
  const userId = await requireAuthenticatedUser();
  const [conversations, showAdminPortal] = await Promise.all([
    listConversations(userId),
    isAdmin(),
  ]);

  return (
    <AppShell
      conversations={conversations ?? []}
      conversationsLoadFailed={conversations === null}
      showAdminPortal={showAdminPortal}
    >
      {children}
    </AppShell>
  );
}
