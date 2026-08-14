import { redirect } from "next/navigation";

import { resolveEslamEntryDestination } from "@/features/auth/entry-routing";
import { isAdmin } from "@/lib/auth/admin";
import { getAuthenticatedUserId } from "@/lib/auth/session";

/** Central entry point: route every visitor to the correct authenticated workspace. */
export default async function HomePage() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    redirect(resolveEslamEntryDestination(null, false));
  }

  redirect(resolveEslamEntryDestination(userId, await isAdmin()));
}
