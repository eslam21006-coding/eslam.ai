import type { ReactNode } from "react";

import { AppShell } from "@/features/app-shell/app-shell";
import { listConversations } from "@/features/conversations/data";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export default async function MenteeAppLayout({ children }: { children: ReactNode }) {
  const userId = await requireAuthenticatedUser();
  const conversations = await listConversations(userId);

  return (
    <AppShell
      conversations={conversations ?? []}
      conversationsLoadFailed={conversations === null}
    >
      {children}
    </AppShell>
  );
}
