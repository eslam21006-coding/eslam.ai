"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const MAX_FIELD_LENGTH = 4000;

const fieldNames = [
  "preferred_name",
  "business_name",
  "niche",
  "markets",
  "audiences",
  "business_model",
  "offers",
  "price_ranges",
  "positioning",
  "methodology",
  "delivery",
  "team_context",
] as const;

type BusinessDnaField = (typeof fieldNames)[number];

function readOptionalText(formData: FormData, name: BusinessDnaField) {
  const value = formData.get(name);
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (normalized.length > MAX_FIELD_LENGTH) return undefined;

  return normalized.length > 0 ? normalized : null;
}

export async function saveBusinessDnaAction(formData: FormData) {
  const userId = await requireAuthenticatedUser();
  const values = Object.fromEntries(
    fieldNames.map((field) => [field, readOptionalText(formData, field)]),
  ) as Record<BusinessDnaField, string | null | undefined>;

  if (Object.values(values).some((value) => value === undefined)) {
    redirect("/app/business?error=invalid_input");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("business_dna").upsert(
    {
      user_id: userId,
      preferred_name: values.preferred_name ?? null,
      business_name: values.business_name ?? null,
      niche: values.niche ?? null,
      markets: values.markets ?? null,
      audiences: values.audiences ?? null,
      business_model: values.business_model ?? null,
      offers: values.offers ?? null,
      price_ranges: values.price_ranges ?? null,
      positioning: values.positioning ?? null,
      methodology: values.methodology ?? null,
      delivery: values.delivery ?? null,
      team_context: values.team_context ?? null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect("/app/business?error=save_failed");
  }

  revalidatePath("/app/business");
  redirect("/app/business?status=saved");
}
