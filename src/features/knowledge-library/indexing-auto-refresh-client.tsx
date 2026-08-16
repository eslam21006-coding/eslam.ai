"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { refreshKnowledgeIndexingSourcesAction } from "@/features/knowledge-library/indexing-auto-refresh";

const INITIAL_AUTO_REFRESH_DELAY_MS = 750;
const AUTO_REFRESH_INTERVAL_MS = 5_000;

/** Keeps provider indexing state synchronized without requiring manual per-source refreshes. */
export function KnowledgeIndexAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let afterId: string | null = null;

    const poll = async () => {
      let shouldContinue = true;
      try {
        const result = await refreshKnowledgeIndexingSourcesAction({ afterId });
        if (cancelled) return;
        if (result.ok) {
          shouldContinue = result.hasMore;
          afterId = result.nextCursor;
          router.refresh();
        }
      } catch (error) {
        console.error("Knowledge Library automatic indexing refresh failed", {
          message: error instanceof Error ? error.message : "Unknown auto-refresh error",
        });
      }

      if (!cancelled && shouldContinue) {
        timer = setTimeout(poll, AUTO_REFRESH_INTERVAL_MS);
      }
    };

    timer = setTimeout(poll, INITIAL_AUTO_REFRESH_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, router]);

  return null;
}
