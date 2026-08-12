import type { TeachEslamValues } from "@/features/teach-eslam/core";

export const TEACHING_REVIEW_STATUSES = [
  { value: "draft", label: "مسودات" },
  { value: "approved", label: "معتمدة" },
  { value: "published", label: "منشورة" },
  { value: "archived", label: "مؤرشفة" },
  { value: "all", label: "الكل" },
] as const;

export type TeachingReviewStatus = (typeof TEACHING_REVIEW_STATUSES)[number]["value"];
export type TeachingLifecycleStatus = Exclude<TeachingReviewStatus, "all">;

export const TEACHING_REVIEW_PAGE_SIZE = 12;
export const TEACHING_REVIEW_BULK_LIMIT = 50;

export function parseTeachingReviewStatus(value: string | undefined): TeachingReviewStatus {
  return TEACHING_REVIEW_STATUSES.some((status) => status.value === value)
    ? (value as TeachingReviewStatus)
    : "draft";
}

export function parseTeachingReviewPage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function isTeachingReviewUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseTeachingVersionNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const versionNumber = Number(value);
  return Number.isInteger(versionNumber) && versionNumber > 0 ? versionNumber : null;
}

export function readTeachingReviewValues(formData: FormData): TeachEslamValues {
  const read = (name: keyof TeachEslamValues) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    title: read("title"),
    content: read("content"),
    summary: read("summary"),
    topics: read("topics"),
    change_note: read("change_note"),
    semantic_layer: read("semantic_layer"),
    item_type: read("item_type"),
    priority: read("priority"),
  };
}

export function teachingReviewReturnHref(formData: FormData, notice: string, extra = "") {
  const rawStatus = formData.get("return_status");
  const status = parseTeachingReviewStatus(typeof rawStatus === "string" ? rawStatus : undefined);
  const rawPage = formData.get("return_page");
  const page = parseTeachingReviewPage(typeof rawPage === "string" ? rawPage : undefined);
  const suffix = extra ? `&${extra}` : "";
  return `/admin/brain?status=${status}&page=${page}&notice=${encodeURIComponent(notice)}${suffix}`;
}
