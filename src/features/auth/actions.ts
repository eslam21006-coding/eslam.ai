"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function readCredential(formData: FormData, name: "email" | "password") {
  const value = formData.get(name);
  if (typeof value !== "string") return "";
  return name === "email" ? value.trim() : value;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function ensureProfile(
  supabase: ServerSupabaseClient,
  userId: string,
) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

  return !error;
}

async function recoverFromProfileFailure(supabase: ServerSupabaseClient) {
  const { error } = await supabase.auth.signOut();

  if (error) {
    redirect("/app/chat?error=profile_init_failed");
  }

  redirect("/auth/login?error=profile_init_failed");
}

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

export async function logoutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    redirect("/app/chat?error=logout_failed");
  }

  redirect("/auth/login?status=signed_out");
}
