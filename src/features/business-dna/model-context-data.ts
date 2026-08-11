import "server-only";

import {
  BUSINESS_DNA_SELECT,
  businessDnaValuesFromRow,
  type BusinessDnaRow,
} from "@/features/business-dna/fields";
import { loadOptionalOwnerContext } from "@/features/business-dna/model-context-load-core";
import { buildBusinessDnaModelContext } from "@/features/business-dna/model-context";
import { createClient } from "@/lib/supabase/server";

function errorSummary(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      message:
        typeof candidate.message === "string"
          ? candidate.message
          : "Unknown Business DNA load error",
    };
  }

  return { message: "Unknown Business DNA load error" };
}

export async function loadBusinessDnaModelContext(userId: string) {
  return loadOptionalOwnerContext<BusinessDnaRow>(userId, {
    queryOwner: async (ownerId) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("business_dna")
        .select(BUSINESS_DNA_SELECT)
        .eq("user_id", ownerId)
        .maybeSingle();

      return { data: data as BusinessDnaRow | null, error };
    },
    buildContext: (row) =>
      buildBusinessDnaModelContext(businessDnaValuesFromRow(row)),
    reportQueryError: (error) => {
      console.error("business_dna model context load failed", errorSummary(error));
    },
    reportFailure: (error) => {
      console.error("business_dna model context load failed", errorSummary(error));
    },
  });
}
