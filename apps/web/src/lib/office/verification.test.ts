import { describe, expect, it } from "vitest";
import type { LayoutSlot } from "./rows";
import { verificationCsv, verificationList, type CsvLabels } from "./verification";

function slot(code: string, partial: Partial<LayoutSlot> = {}): LayoutSlot {
  return {
    rowNo: 1,
    positionNo: 1,
    suffix: null,
    kind: "row",
    code,
    treeId: code,
    position: { x: 0, y: 0 },
    uncertaintyM: 0.2,
    flags: [],
    ...partial,
  };
}

const labels: CsvLabels = {
  header: ["kod", "neden", "enlem", "boylam", "belirsizlik_m"],
  reasons: {
    unsure: "emin değilim",
    high_uncertainty: "belirsizlik yüksek",
    triangulation: "üçgenleme uyarısı",
    empty_slot: "boş yer",
    off_row: "sıra dışında",
    crowded: "çift gövde",
  },
};

describe("verificationList", () => {
  const slots = [
    slot("S1-1"),
    slot("S1-2", { uncertaintyM: 0.9 }),
    slot("S1-3", { treeId: null, uncertaintyM: 0.4 }),
    slot("S1-4"),
    slot("S1-4a", { kind: "interstitial", suffix: "a", flags: ["off_row", "crowded"] }),
    slot("S1-5"),
  ];
  const reviews = new Map([
    ["S1-4", { unsure: true, warnings: [] }],
    ["S1-5", { unsure: false, warnings: ["near_parallel" as const, "high_uncertainty" as const] }],
    ["S1-1", { unsure: false, warnings: ["high_uncertainty" as const] }],
  ]);
  const items = verificationList(slots, reviews, () => ({ lat: 37, lon: 38 }), 0.5);

  it("lists unsure, uncertain, flagged and empty slots", () => {
    expect(items.map((i) => [i.code, i.reasons])).toEqual([
      ["S1-2", ["high_uncertainty"]],
      ["S1-3", ["empty_slot"]],
      ["S1-4", ["unsure"]],
      ["S1-4a", ["off_row", "crowded"]],
      ["S1-5", ["triangulation"]],
    ]);
  });

  it("exports CSV with a BOM, quoting and Turkish labels", () => {
    const csv = verificationCsv(items, labels);
    expect(csv.startsWith("﻿kod,neden,enlem,boylam,belirsizlik_m\r\n")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe("S1-2,belirsizlik yüksek,37.00000000,38.00000000,0.90");
    expect(lines[4]).toBe("S1-4a,sıra dışında; çift gövde,37.00000000,38.00000000,0.20");
    expect(verificationCsv([{ ...items[0], code: 'a,"b"' }], labels)).toContain('"a,""b"""');
  });
});
