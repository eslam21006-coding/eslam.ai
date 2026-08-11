import "server-only";

import { notFound, redirect } from "next/navigation";

import {
  resolveAdminAuthorization,
  type AdminAuthorizationDependencies,
  type AdminCandidate,
} from "@/lib/auth/admin-core";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function getCurrentAdminCandidate(): Promise<AdminCandidate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    emailConfirmedAt: data.user.email_confirmed_at ?? null,
  };
}

function createAdminAuthorizationDependencies(): AdminAuthorizationDependencies {
  const admin = getSupabaseAdminClient();

  return {
    findByUserId: async (userId) => {
      const { data, error } = await admin
        .from("admin_users")
        .select("email,user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    findByEmail: async (email) => {
      const { data, error } = await admin
        .from("admin_users")
        .select("email,user_id")
        .eq("email", email)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    bindUser: async (email, userId) => {
      const { data, error } = await admin
        .from("admin_users")
        .update({ user_id: userId })
        .eq("email", email)
        .is("user_id", null)
        .select("email,user_id")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  };
}

async function authorizeCandidate(candidate: AdminCandidate) {
  return resolveAdminAuthorization(
    candidate,
    createAdminAuthorizationDependencies(),
  );
}

function reportAdminAuthorizationFailure(error: unknown) {
  console.error("admin authorization check failed", {
    message:
      error instanceof Error ? error.message : "Unknown admin authorization error",
  });
}

export async function isAdmin() {
  const candidate = await getCurrentAdminCandidate();
  if (!candidate) return false;

  try {
    return (await authorizeCandidate(candidate)).authorized;
  } catch (error) {
    reportAdminAuthorizationFailure(error);
    return false;
  }
}

export async function requireAdmin() {
  const candidate = await getCurrentAdminCandidate();
  if (!candidate) {
    redirect("/auth/login");
  }

  try {
    const authorization = await authorizeCandidate(candidate);
    if (!authorization.authorized) {
      notFound();
    }

    return authorization;
  } catch (error) {
    reportAdminAuthorizationFailure(error);
    notFound();
  }
}
