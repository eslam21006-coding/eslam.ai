"use client";

import { useEffect, useState } from "react";

function selectableInputs(formId: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[name="item_id"][form="${formId}"]`,
    ),
  );
}

/** Keeps Brain bulk selection synchronized with the visible draft checkboxes. */
export function BrainBulkSelection({ formId, total }: { formId: string; total: number }) {
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const inputs = selectableInputs(formId);
    const sync = () => setSelectedCount(inputs.filter((input) => input.checked).length);

    for (const input of inputs) input.addEventListener("change", sync);
    sync();

    return () => {
      for (const input of inputs) input.removeEventListener("change", sync);
    };
  }, [formId, total]);

  const allSelected = total > 0 && selectedCount === total;

  const toggleAll = () => {
    const inputs = selectableInputs(formId);
    const nextChecked = !allSelected;
    for (const input of inputs) input.checked = nextChecked;
    setSelectedCount(nextChecked ? inputs.length : 0);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={toggleAll}
        className="min-h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--foreground-muted)]"
      >
        {allSelected ? "إلغاء تحديد الكل" : `تحديد الكل (${total})`}
      </button>
      <span className="text-xs text-[var(--foreground-subtle)]">
        {selectedCount} من {total} محددة
      </span>
    </div>
  );
}
