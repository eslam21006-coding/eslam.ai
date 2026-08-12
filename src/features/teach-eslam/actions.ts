"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type TeachEslamActionState,
  type TeachEslamValues,
  validateTeachEslamDraft,
} from "@/features/teach-eslam/core";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

function readText(formData: FormData, name: keyof TeachEslamValues) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readTeachEslamValues(formData: FormData): TeachEslamValues {
  return {
    title: readText(formData, "title"),
    content: readText(formData, "content"),
    summary: readText(formData, "summary"),
    topics: readText(formData, "topics"),
    change_note: readText(formData, "change_note"),
    semantic_layer: readText(formData, "semantic_layer"),
    item_type: readText(formData, "item_type"),
    priority: readText(formData, "priority"),
  };
}

function failureState(
  previousState: TeachEslamActionState,
  values: TeachEslamValues,
  error: TeachEslamActionState["error"],
): TeachEslamActionState {
  return {
    error,
    revision: previousState.revision + 1,
    values,
    created: null,
  };
}

export async function createTeachEslamDraftAction(
  previousState: TeachEslamActionState,
  formData: FormData,
): Promise<TeachEslamActionState> {
  const authorization = await requireAdmin();
  const values = readTeachEslamValues(formData);
  const validation = validateTeachEslamDraft(values);

  if (!validation.ok) {
    return failureState(previousState, values, "invalid_input");
  }

  const draft = validation.draft;
  const payload: Json = {
    semantic_layer: draft.semantic_layer,
    item_type: draft.item_type,
    priority: draft.priority,
    title: draft.title,
    content: draft.content,
    summary: draft.summary,
    topics: draft.topics,
    change_note: draft.change_note,
    created_by: authorization.userId,
  };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_eslam_brain_draft", {
    p_payload: payload,
  });

  if (error || typeof data !== "string") {
    console.error("Teach Eslam draft creation failed", {
      code: error?.code,
      message: error?.message ?? "RPC returned no item id",
    });
    return failureState(previousState, values, "save_failed");
  }

  revalidatePath("/admin/teach");
  revalidatePath("/admin/brain");

  return {
    error: null,
    revision: previousState.revision + 1,
    values,
    created: {
      itemId: data,
      title: draft.title,
      versionNumber: 1,
    },
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function publishTeachEslamDraftAction(formData: FormData) {
  const authorization = await requireAdmin();
  const rawItemId = formData.get("item_id");
  const rawVersionNumber = formData.get("version_number");
  const itemId = typeof rawItemId === "string" ? rawItemId : "";
  const versionNumber = typeof rawVersionNumber === "string" ? Number(rawVersionNumber) : NaN;

  if (!isUuid(itemId) || versionNumber !== 1) {
    redirect("/admin/teach?status=publish-invalid");
  }

  const admin = getSupabaseAdminClient();
  const { data: version, error: versionError } = await admin
    .from("eslam_brain_versions")
    .select("item_id,version_number")
    .eq("item_id", itemId)
    .eq("version_number", versionNumber)
    .maybeSingle();

  if (versionError || !version) {
    console.error("Teach Eslam publish version lookup failed", {
      code: versionError?.code,
      message: versionError?.message ?? "Version not found",
    });
    redirect("/admin/teach?status=publish-failed");
  }

  const { data: published, error: publishError } = await admin
    .from("eslam_brain_items")
    .update({
      status: "published",
      approved_version_number: versionNumber,
      published_version_number: versionNumber,
    })
    .eq("id", itemId)
    .eq("created_by", authorization.userId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (publishError || !published) {
    console.error("Teach Eslam publish failed", {
      code: publishError?.code,
      message: publishError?.message ?? "Draft not found or no longer publishable",
    });
    redirect("/admin/teach?status=publish-failed");
  }

  revalidatePath("/admin/teach");
  revalidatePath("/admin/brain");
  redirect("/admin/teach?status=published");
}
