"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/** Reads a credential field while trimming only email input and preserving password bytes exactly. */
function readCredential(formData: FormData, name: "email" | "password") {
  const value = formData.get(name);
  if (typeof value !== "string") return "";
  return name === "email" ? value.trim() : value;
}

/** Performs the lightweight email-shape validation used by the authentication forms. */
function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Ensures the authenticated account has its owner-scoped application profile row. */
async function ensureProfile(
  supabase: ServerSupabaseClient,
  userId: string,
) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

  return !error;
}

/** Signs out after profile initialization failure and returns the user to a recoverable auth state. */
async function recoverFromProfileFailure(supabase: ServerSupabaseClient) {
  const { error } = await supabase.auth.signOut();

  if (error) {
    redirect("/app/chat?error=profile_init_failed");
  }

  redirect("/auth/login?error=profile_init_failed");
}

/** Authenticates an existing account, ensures its profile, then delegates destination choice to `/`. */
export async function loginAction(formData: FormData) {
  const email = readCredential(formData, "email");
  const password = readCredential(formData, "password");

  if (!isValidEmail(email) || password.length < 6) {
    redirect("/auth/login?error=invalid_input");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect("/auth/login?error=invalid_credentials");
  }

  if (!(await ensureProfile(supabase, data.user.id))) {
    await recoverFromProfileFailure(supabase);
  }

  redirect("/");
}

/** Creates an account, handles optional email confirmation, then delegates destination choice to `/`. */
export async function signupAction(formData: FormData) {
  const email = readCredential(formData, "email");
  const password = readCredential(formData, "password");

  if (!isValidEmail(email) || password.length < 8) {
    redirect("/auth/signup?error=invalid_input");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    redirect("/auth/signup?error=signup_failed");
  }

  if (!data.session) {
    redirect("/auth/login?status=check_email");
  }

  if (!(await ensureProfile(supabase, data.user.id))) {
    await recoverFromProfileFailure(supabase);
  }

  redirect("/");
}

/** Ends the current Supabase session and reports sign-out failures through the user workspace. */
export async function logoutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    redirect("/app/chat?error=logout_failed");
  }

  redirect("/auth/login?status=signed_out");
}
