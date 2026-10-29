import { describe, expect, it } from "vitest";
import type { ParcelReport } from "@/lib/portal/data";
import { buildInventoryReport } from "@/lib/portal/inventory-report";
import { InventoryDocument, inventoryPdf } from "./inventory-pdf";
import { SampleWatermark } from "./parts";
import { ReportDocument, reportPdf } from "./report-pdf";

// Demo PDFs (docs/demo-turu.md §11.6): the watermark only with { demo: true },
// and the ASCII sample marker in the (uncompressed) Info dictionary.

const MARKER = "orchadOS ornek rapor (sentetik demo verisi)";
const NOW = new Date("2026-10-27T10:00:00Z");

const inventory = buildInventoryReport({
  parcel: {
    id: "p",
    name: "Örnek Bahçe",
    place: "Köy",
    estimatedTreeCount: null,
    estimatedAreaM2: null,
  },
  inventory: { sessionId: "s", date: "2026-06-09", approvedAt: "2026-06-12T10:00:00Z" },
  boundary: null,
  slots: [],
  zones: [],
  measurements: [],
  deadTreeIds: [],
  coverage: null,
  panoramas: 0,
});

const report = {
  parcel: { id: "p", name: "Örnek Bahçe" },
  boundary: null,
  slots: { type: "FeatureCollection", features: [] },
  slotCount: 0,
  activeTreeCount: 0,
  bounds: null,
  latest: {
    id: "s",
    time: "2026-07-14T07:00:00Z",
    kind: "periodic_scan",
    methodologyVersion: null,
    publishedAt: "2026-07-20T10:00:00Z",
    distribution: { healthy: 0, attention: 0, problem: 0, dead: 0, absent: 0, unassessed: 0 },
    assessedCount: 0,
    score: null,
  },
  previous: null,
  change: null,
  scoreChange: null,
  scoreBasis: "first",
  scoreUnassessedPct: null,
  audit: null,
  findings: [],
  metrics: [],
  visits: [],
  mapVisits: [],
  coverage: {},
  dimensions: null,
} as unknown as ParcelReport;

// Element types anywhere under a rendered function component's tree.
function hasElement(node: unknown, type: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((n) => hasElement(n, type));
  const el = node as { type?: unknown; props?: { children?: unknown } };
  return el.type === type || hasElement(el.props?.children, type);
}

describe("sample PDFs", () => {
  it.each([
    ["report", (demo: boolean) => ReportDocument({ report, now: NOW, demo })],
    ["inventory", (demo: boolean) => InventoryDocument({ report: inventory, now: NOW, demo })],
  ] as const)("%s carries the watermark and the marker only in the demo", (_name, doc) => {
    const demo = doc(true);
    const real = doc(false);
    expect(hasElement(demo, SampleWatermark)).toBe(true);
    expect(hasElement(real, SampleWatermark)).toBe(false);
    expect(demo.props).toMatchObject({ subject: MARKER, keywords: MARKER });
    expect(real.props).not.toHaveProperty("subject");
    expect(real.props).not.toHaveProperty("keywords");
  });

  it("the marker is found in the bytes of both demo PDFs and in no real one", async () => {
    const pdfs = await Promise.all([
      reportPdf(report, NOW, { demo: true }),
      inventoryPdf(inventory, NOW, { demo: true }),
      reportPdf(report, NOW),
      inventoryPdf(inventory, NOW),
    ]);
    const has = (b: Buffer) => b.includes(Buffer.from("orchadOS ornek rapor", "latin1"));
    expect(pdfs.map(has)).toEqual([true, true, false, false]);
  }, 60_000);
});
