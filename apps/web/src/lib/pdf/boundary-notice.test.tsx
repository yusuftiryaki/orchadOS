import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import type { ParcelReport } from "@/lib/portal/data";
import type { FindingItem } from "@/lib/portal/findings";
import { buildInventoryReport } from "@/lib/portal/inventory-report";
import { InventoryDocument, inventoryPdf } from "./inventory-pdf";
import { ReportDocument, reportPdf } from "./report-pdf";

// Boundary notice (docs/hukuk/kararlar.md H07, T16): the long form in a fixed
// element of every Page, so react-pdf repeats it on every rendered page. The
// embedded fonts are subsets, so the text is glyph-encoded in the bytes: the
// element tree carries the assertion, the bytes only the page count.

const NOW = new Date("2026-10-27T10:00:00Z");

const baseInventory = buildInventoryReport({
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

const baseReport = {
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

// Long enough for several pages: many findings, many infrastructure lines.
const findings: FindingItem[] = Array.from({ length: 60 }, (_, i) => ({
  id: `f${i}`,
  sessionId: "s",
  treeId: null,
  treeCode: `S1-${i + 1}`,
  kind: "other",
  severity: "medium",
  description: "Sentetik bulgu açıklaması; sayfa taşırmak için yeterince uzun bir metin.",
  recommendation: "Sentetik öneri.",
  approved: true,
  point: null,
}));
const report = { ...baseReport, findings } as ParcelReport;
const inventory = {
  ...baseInventory,
  infrastructure: Array.from({ length: 90 }, (_, i) => ({
    kind: "well" as const,
    count: i + 1,
    lengthM: null,
  })),
};

// Expands function components (all pure here) into react-pdf primitives.
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") {
    return expand((el.type as (p: unknown) => ReactNode)(el.props));
  }
  if (typeof el.type === "string" || el.props.children !== undefined) {
    return createElement(el.type, { ...el.props }, expand(el.props.children));
  }
  return el;
}

function find(node: ReactNode, pred: (el: ReactElement<Record<string, unknown>>) => boolean) {
  const out: ReactElement<Record<string, unknown>>[] = [];
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Record<string, unknown>>;
    if (pred(el)) out.push(el);
    walk(el.props.children as ReactNode);
  };
  walk(node);
  return out;
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children);
  return "";
}

// Page objects in the PDF ("/Type /Page", not "/Pages").
function pageCount(buf: Buffer): number {
  return buf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
}

describe("boundary notice in report PDFs", () => {
  it.each([
    ["report", (demo: boolean) => ReportDocument({ report, now: NOW, demo })],
    ["inventory", (demo: boolean) => InventoryDocument({ report: inventory, now: NOW, demo })],
  ] as const)("every Page of the %s has the fixed long form", (_name, doc) => {
    for (const demo of [false, true]) {
      const pages = find(expand(doc(demo)), (el) => el.type === "PAGE");
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) {
        const fixed = find(page.props.children as ReactNode, (el) => el.props.fixed === true);
        const notices = fixed.filter((el) => text(el) === t.boundaryNotice.long);
        expect(notices).toHaveLength(1);
      }
    }
  });

  it("the notice is exactly the binding long form", () => {
    expect(t.boundaryNotice.long).toBe(
      "Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin gösterdiği fiili kullanım sınırıdır. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır.",
    );
    expect(t.boundaryNotice.short).toBe(
      "Fiili kullanım sınırı; tapu ya da kadastro sınırı değildir.",
    );
  });

  it("the synthetic documents render to several pages", async () => {
    const [a, b] = await Promise.all([reportPdf(report, NOW), inventoryPdf(inventory, NOW)]);
    expect(pageCount(a)).toBeGreaterThan(1);
    expect(pageCount(b)).toBeGreaterThan(1);
  }, 60_000);
});

// T23 (H05): the approving expert's name and title in both PDFs (demo: none,
// the database gives no approver there).
describe("approving expert in report PDFs", () => {
  const approver = { name: "Örnek Uzman", title: "Ziraat Mühendisi" };
  const line = "Onaylayan uzman: Örnek Uzman, Ziraat Mühendisi";
  const docText = (doc: ReactNode) => text(expand(doc));

  it("the report names the expert who approved the latest visit", () => {
    expect(docText(ReportDocument({ report: { ...report, approver }, now: NOW }))).toContain(line);
    expect(docText(ReportDocument({ report, now: NOW }))).not.toContain("Onaylayan uzman");
  });

  it("the inventory report names the expert who approved the inventory", () => {
    const withApprover = {
      ...inventory,
      inventory: { ...inventory.inventory!, approver },
    };
    expect(docText(InventoryDocument({ report: withApprover, now: NOW }))).toContain(line);
    expect(
      docText(
        InventoryDocument({
          report: {
            ...inventory,
            inventory: { ...inventory.inventory!, approver: { name: "Ad Soyad", title: null } },
          },
          now: NOW,
        }),
      ),
    ).toContain("Onaylayan uzman: Ad Soyad");
  });
});
