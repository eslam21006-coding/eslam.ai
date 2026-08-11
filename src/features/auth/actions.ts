"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function readCredential(formData: FormData, name: "email" | "password") {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function ensureProfile(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    throw new Error("Unable to initialize the user profile.");
  }
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

  await ensureProfile(data.user.id);
  redirect("/app/chat");
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

  await ensureProfile(data.user.id);
  redirect("/app/chat");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login?status=signed_out");
}
