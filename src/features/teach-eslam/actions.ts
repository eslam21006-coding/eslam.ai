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

type DirectPublishRpcResult = PromiseLike<{
  data: string | null;
  error: { code?: string; message?: string } | null;
}>;

type DirectPublishRpc = (
  functionName: "publish_eslam_brain_draft_direct",
  args: { p_item_id: string; p_created_by: string; p_version_number: number },
) => DirectPublishRpcResult;

export async function publishTeachEslamDraftAction(formData: FormData) {
  const authorization = await requireAdmin();
  const rawItemId = formData.get("item_id");
  const rawVersionNumber = formData.get("version_number");
  const itemId = typeof rawItemId === "string" ? rawItemId : "";
  const versionNumber = typeof rawVersionNumber === "string" ? Number(rawVersionNumber) : NaN;

  if (!isUuid(itemId) || !Number.isInteger(versionNumber) || versionNumber <= 0) {
    redirect("/admin/teach?status=publish-invalid");
  }

  const admin = getSupabaseAdminClient();
  const directPublishRpc = admin.rpc as unknown as DirectPublishRpc;
  const { data: published, error: publishError } = await directPublishRpc(
    "publish_eslam_brain_draft_direct",
    {
      p_item_id: itemId,
      p_created_by: authorization.userId,
      p_version_number: versionNumber,
    },
  );

  if (publishError || published !== "published") {
    console.error("Teach Eslam direct publish failed", {
      code: publishError?.code,
      message: publishError?.message ?? "Draft not found, stale, or requires review",
    });
    redirect("/admin/teach?status=publish-failed");
  }

  revalidatePath("/admin/teach");
  revalidatePath("/admin/brain");
  redirect("/admin/teach?status=published");
}
