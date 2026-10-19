import type { LatLon } from "./local-frame";
import type { LayoutSlot } from "./rows";
import type { TriangulationWarning } from "./triangulate";

// Verification list (MVP Module 2, step 8): slots the field crew should look
// at on the verification visit.

export type VerificationReason =
  "unsure" | "high_uncertainty" | "triangulation" | "empty_slot" | "off_row" | "crowded";

export const VERIFICATION_REASONS: VerificationReason[] = [
  "unsure",
  "high_uncertainty",
  "triangulation",
  "empty_slot",
  "off_row",
  "crowded",
];

export interface TreeReview {
  unsure: boolean;
  warnings: TriangulationWarning[];
}

export interface VerificationItem {
  code: string;
  treeId: string | null;
  reasons: VerificationReason[];
  uncertaintyM: number;
  position: LatLon;
}

export function verificationList(
  slots: LayoutSlot[],
  reviews: Map<string, TreeReview>,
  toLatLon: (slot: LayoutSlot) => LatLon,
  maxUncertaintyM: number,
): VerificationItem[] {
  const items: VerificationItem[] = [];
  for (const slot of slots) {
    const reasons = new Set<VerificationReason>();
    const review = slot.treeId ? reviews.get(slot.treeId) : undefined;
    if (review?.unsure) reasons.add("unsure");
    if (slot.treeId && slot.uncertaintyM > maxUncertaintyM) reasons.add("high_uncertainty");
    // high_uncertainty is already its own reason; other warnings mean a doubtful intersection.
    if (review?.warnings.some((w) => w !== "high_uncertainty")) reasons.add("triangulation");
    if (!slot.treeId) reasons.add("empty_slot");
    for (const flag of slot.flags) reasons.add(flag);
    if (reasons.size === 0) continue;
    items.push({
      code: slot.code,
      treeId: slot.treeId,
      reasons: VERIFICATION_REASONS.filter((r) => reasons.has(r)),
      uncertaintyM: slot.uncertaintyM,
      position: toLatLon(slot),
    });
  }
  return items;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface CsvLabels {
  header: [string, string, string, string, string];
  reasons: Record<VerificationReason, string>;
}

// RFC 4180 with a UTF-8 byte order mark so spreadsheet programs read the
// Turkish letters right.
export function verificationCsv(items: VerificationItem[], labels: CsvLabels): string {
  const lines = [labels.header.map(csvField).join(",")];
  for (const item of items) {
    lines.push(
      [
        item.code,
        item.reasons.map((r) => labels.reasons[r]).join("; "),
        item.position.lat.toFixed(8),
        item.position.lon.toFixed(8),
        item.uncertaintyM.toFixed(2),
      ]
        .map(csvField)
        .join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
