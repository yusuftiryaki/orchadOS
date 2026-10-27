import { describe, expect, it } from "vitest";
import { buildInventoryReport } from "@/lib/portal/inventory-report";
import { inventoryPdf } from "./inventory-pdf";

// Renders a real PDF with the bundled fonts (no browser).
describe("pdf reports", () => {
  it("inventory report renders with Turkish text", async () => {
    const report = buildInventoryReport({
      parcel: {
        id: "p",
        name: "Şahinbey Ğ bahçesi",
        place: "Köy",
        estimatedTreeCount: null,
        estimatedAreaM2: null,
      },
      inventory: { sessionId: "s", date: "2026-10-10", approvedAt: "2026-10-12T10:00:00Z" },
      boundary: null,
      slots: [
        {
          code: "S1-1",
          rowNo: 1,
          kind: "row",
          position: { lat: 37, lon: 37.3 },
          unsure: false,
          tree: {
            id: "t",
            sex: "unknown",
            graft: "grafted",
            ageClass: "young",
            stemForm: "single",
            cultivar: null,
          },
        },
      ],
      zones: [],
      measurements: [],
      deadTreeIds: [],
      coverage: null,
      panoramas: 0,
    });
    const buf = await inventoryPdf(report, new Date("2026-10-27T10:00:00Z"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  }, 30_000);
});
