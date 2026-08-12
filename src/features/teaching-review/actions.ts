"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { validateTeachEslamDraft } from "@/features/teach-eslam/core";
import {
  isTeachingReviewUuid,
  parseTeachingVersionNumber,
  readTeachingReviewValues,
  teachingReviewReturnHref,
} from "@/features/teaching-review/core";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

function revalidateTeachingAdmin() {
  revalidatePath("/admin/brain");
  revalidatePath("/admin/teach");
}

function readReviewIdentity(formData: FormData) {
  const rawItemId = formData.get("item_id");
  const itemId = typeof rawItemId === "string" ? rawItemId : "";
  const versionNumber = parseTeachingVersionNumber(formData.get("version_number"));
  return { itemId, versionNumber };
}

async function runLifecycleAction(
  formData: FormData,
  action: "approve" | "publish" | "archive",
  successNotice: string,
) {
  const authorization = await requireAdmin();
  const { itemId, versionNumber } = readReviewIdentity(formData);

  if (!isTeachingReviewUuid(itemId) || versionNumber === null) {
    redirect(teachingReviewReturnHref(formData, "invalid-request"));
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("review_eslam_brain_item", {
    p_item_id: itemId,
    p_created_by: authorization.userId,
    p_action: action,
    p_version_number: versionNumber,
  });

  if (error || data !== successNotice) {
    console.error("Teaching review lifecycle action failed", {
      action,
      code: error?.code,
      message: error?.message ?? `Unexpected lifecycle result: ${String(data)}`,
    });
    redirect(teachingReviewReturnHref(formData, `${action}-failed`));
  }

  revalidateTeachingAdmin();
  redirect(teachingReviewReturnHref(formData, successNotice));
}

export async function editTeachingDraftAction(formData: FormData) {
  const authorization = await requireAdmin();
  const { itemId, versionNumber } = readReviewIdentity(formData);
  const values = readTeachingReviewValues(formData);
  const validation = validateTeachEslamDraft(values);

  if (!isTeachingReviewUuid(itemId) || versionNumber === null || !validation.ok) {
    redirect(teachingReviewReturnHref(formData, "edit-invalid"));
  }

  const draft = validation.draft;
  const payload: Json = {
    item_id: itemId,
    created_by: authorization.userId,
    expected_version_number: versionNumber,
    semantic_layer: draft.semantic_layer,
    item_type: draft.item_type,
    priority: draft.priority,
    title: draft.title,
    content: draft.content,
    summary: draft.summary,
    topics: draft.topics,
    change_note: draft.change_note,
  };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_eslam_brain_review_version", {
    p_payload: payload,
  });

  if (error || typeof data !== "number" || data !== versionNumber + 1) {
    console.error("Teaching review edit failed", {
      code: error?.code,
      message: error?.message ?? `Unexpected review version: ${String(data)}`,
    });
    redirect(teachingReviewReturnHref(formData, "edit-failed"));
  }

  revalidateTeachingAdmin();
  redirect(teachingReviewReturnHref(formData, "edited", `version=${data}`));
}

export async function approveTeachingAction(formData: FormData) {
  await runLifecycleAction(formData, "approve", "approved");
}

export async function publishTeachingAction(formData: FormData) {
  await runLifecycleAction(formData, "publish", "published");
}

export async function archiveTeachingAction(formData: FormData) {
  await runLifecycleAction(formData, "archive", "archived");
}

export async function bulkApproveTeachingsAction(formData: FormData) {
  const authorization = await requireAdmin();
  const rawIds = formData.getAll("item_id");
  const stringIds = rawIds.filter((value): value is string => typeof value === "string");
  const itemIds = Array.from(new Set(stringIds));

  if (
    itemIds.length < 1 ||
    itemIds.length > 50 ||
    itemIds.length !== rawIds.length ||
    itemIds.some((itemId) => !isTeachingReviewUuid(itemId))
  ) {
    redirect(teachingReviewReturnHref(formData, "bulk-invalid"));
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("bulk_approve_eslam_brain_items", {
    p_item_ids: itemIds,
    p_created_by: authorization.userId,
  });

  if (error || typeof data !== "number" || data !== itemIds.length) {
    console.error("Teaching review bulk approval failed", {
      code: error?.code,
      message: error?.message ?? `Unexpected bulk approval result: ${String(data)}`,
    });
    redirect(teachingReviewReturnHref(formData, "bulk-failed"));
  }

  revalidateTeachingAdmin();
  redirect(teachingReviewReturnHref(formData, "bulk-approved", `count=${data}`));
}
