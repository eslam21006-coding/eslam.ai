import "server-only";

import {
  BUSINESS_DNA_SELECT,
  businessDnaValuesFromRow,
  type BusinessDnaRow,
} from "@/features/business-dna/fields";
import { buildBusinessDnaModelContext } from "@/features/business-dna/model-context";
import { createClient } from "@/lib/supabase/server";

export async function loadBusinessDnaModelContext(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_dna")
    .select(BUSINESS_DNA_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("business_dna model context load failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return buildBusinessDnaModelContext(
    businessDnaValuesFromRow(data as BusinessDnaRow | null),
  );
}
