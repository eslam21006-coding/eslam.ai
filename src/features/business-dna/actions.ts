"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MAX_FIELD_LENGTH,
  businessDnaFieldNames,
  type BusinessDnaValues,
} from "@/features/business-dna/fields";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";

export type BusinessDnaActionState = {
  error: "invalid_input" | "save_failed" | null;
  values: BusinessDnaValues;
};

function readSubmittedValues(formData: FormData): BusinessDnaValues {
  return Object.fromEntries(
    businessDnaFieldNames.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value.trim() : ""];
    }),
  ) as BusinessDnaValues;
}

export async function saveBusinessDnaAction(
  _previousState: BusinessDnaActionState,
  formData: FormData,
): Promise<BusinessDnaActionState> {
  const userId = await requireAuthenticatedUser();
  const values = readSubmittedValues(formData);

  if (Object.values(values).some((value) => value.length > MAX_FIELD_LENGTH)) {
    return { error: "invalid_input", values };
  }

  const payload = {
    user_id: userId,
    ...Object.fromEntries(
      businessDnaFieldNames.map((field) => [field, values[field] || null]),
    ),
  } as TablesInsert<"business_dna">;

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_dna")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("business_dna upsert failed", {
      code: error.code,
      message: error.message,
    });
    return { error: "save_failed", values };
  }

  revalidatePath("/app/business");
  redirect("/app/business?status=saved");
}
