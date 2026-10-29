"use client";

import { t } from "@/lib/i18n";

// The PDF report is the browser's "Save as PDF" with the portal's print styles.
export function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ? `button button-quiet ${className}` : "button button-quiet"}
      onClick={() => {
        // Folded lists ("N bulgu daha") are printed in full.
        for (const details of document.querySelectorAll("details")) details.open = true;
        window.print();
      }}
    >
      {t.portal.report.print}
    </button>
  );
}
