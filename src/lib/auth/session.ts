import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  const subject = data?.claims?.sub;
  return typeof subject === "string" && subject.length > 0 ? subject : null;
}

export async function requireAuthenticatedUser() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    redirect("/auth/login");
  }

  return userId;
}

/** Auth pages hand authenticated users back to the central role router. */
export async function redirectAuthenticatedUser() {
  const userId = await getAuthenticatedUserId();

  if (userId) {
    redirect("/");
  }
}
