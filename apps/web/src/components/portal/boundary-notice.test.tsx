import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n";
import type { PolygonGeometry } from "@/lib/map/geo";
import type { BoundaryCard } from "@/lib/portal/boundary";
import type { ParcelReport } from "@/lib/portal/data";
import { buildInventoryReport } from "@/lib/portal/inventory-report";
import { BoundaryCardView } from "./boundary-card";
import { HealthMap } from "./health-map";
import { InventoryReportView, SlotMap } from "./inventory-report";
import { ParcelReportView } from "./parcel-report";
import { PortalMap } from "./portal-map";

// Boundary notice (docs/hukuk/kararlar.md H07, T16): the long form on every
// owner report page, the short form under every owner-facing map.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/portal/parsel/p",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/portal/parsel/[parcelId]/actions", () => ({
  approveBoundaryAction: async () => ({ ok: true }),
  askQuestionAction: async () => {},
  editQuestionAction: async () => {},
  replyQuestionAction: async () => {},
  addViewerAction: async () => {},
  removeViewerAction: async () => {},
  cancelGardenRemovalAction: async () => {},
  requestGardenRemovalAction: async () => {},
}));

const LONG = t.boundaryNotice.long;
const SHORT = t.boundaryNotice.short;
// renderToStaticMarkup escapes apostrophes and quotes; the notices have neither.
const count = (html: string, text: string) => html.split(text).length - 1;

const ring = [
  { lat: 37.0, lon: 37.3 },
  { lat: 37.001, lon: 37.3 },
  { lat: 37.001, lon: 37.301 },
];
const boundary: PolygonGeometry = {
  type: "Polygon",
  coordinates: [[...ring.map((p): [number, number] => [p.lon, p.lat]), [37.3, 37.0]]],
};

const card: BoundaryCard = {
  latest: {
    id: "b",
    version: 2,
    ring,
    source: "field_survey",
    areaM2: 9000,
    vertexUncertaintyM: 0.05,
    approvedAt: null,
    approvedByMe: false,
  },
  declared: null,
  role: "owner",
  canApprove: true,
  awaitingApproval: true,
  inventory: null,
};

const inventory = buildInventoryReport({
  parcel: { id: "p", name: "Örnek", place: "Köy", estimatedTreeCount: null, estimatedAreaM2: null },
  inventory: { sessionId: "s", date: "2026-06-09", approvedAt: "2026-06-12T10:00:00Z" },
  boundary: null,
  slots: [
    {
      code: "S1-1",
      rowNo: 1,
      kind: "row",
      position: { lat: 37, lon: 37.3 },
      unsure: false,
      tree: null,
    },
    {
      code: "S1-2",
      rowNo: 1,
      kind: "row",
      position: { lat: 37.0001, lon: 37.3001 },
      unsure: false,
      tree: null,
    },
  ],
  zones: [],
  measurements: [],
  deadTreeIds: [],
  coverage: null,
  panoramas: 0,
});

const report = {
  parcel: { id: "p", name: "Örnek Bahçe" },
  boundary: { version: 2, geometry: boundary },
  slots: { type: "FeatureCollection", features: [] },
  slotCount: 0,
  activeTreeCount: 0,
  bounds: null,
  latest: null,
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

describe("boundary notice", () => {
  it("the portal map carries the short form", () => {
    const html = renderToStaticMarkup(
      <PortalMap boundary={boundary} slots={[]} bounds={null} label="Harita" />,
    );
    expect(html).toContain('data-testid="map-boundary-caption"');
    expect(count(html, SHORT)).toBe(1);
  });

  it("the health map carries the short form", () => {
    const html = renderToStaticMarkup(
      <HealthMap
        parcelId="p"
        boundary={boundary}
        slots={report.slots}
        findings={[]}
        bounds={null}
      />,
    );
    expect(count(html, SHORT)).toBe(1);
  });

  it("the boundary card carries both forms, demo included", () => {
    for (const demo of [false, true]) {
      const html = renderToStaticMarkup(<BoundaryCardView parcelId="p" card={card} demo={demo} />);
      expect(count(html, SHORT)).toBe(1);
      expect(count(html, LONG)).toBe(1);
    }
  });

  it("the inventory map and report carry both forms", () => {
    expect(inventory.map).not.toBeNull();
    expect(count(renderToStaticMarkup(<SlotMap map={inventory.map!} />), SHORT)).toBe(1);
    const html = renderToStaticMarkup(<InventoryReportView report={inventory} />);
    expect(count(html, SHORT)).toBe(1);
    expect(count(html, LONG)).toBe(1);
  });

  it("the parcel report carries the long form by its map", () => {
    for (const demo of [false, true]) {
      const html = renderToStaticMarkup(
        <ParcelReportView report={report} boundaryCard={card} demo={demo} />,
      );
      // Health map and boundary card (awaiting approval) each have their
      // caption; the long form once, on the card where the boundary is
      // approved.
      expect(count(html, SHORT)).toBe(2);
      expect(count(html, LONG)).toBe(1);
      expect(html.indexOf(LONG)).toBeGreaterThan(html.indexOf('data-testid="boundary-card"'));
    }
  });

  it("an approved boundary leaves the long form under the health map", () => {
    const approved: BoundaryCard = {
      ...card,
      latest: { ...card.latest!, approvedAt: "2026-10-12T10:00:00Z", approvedByMe: true },
      canApprove: false,
      awaitingApproval: false,
    };
    for (const demo of [false, true]) {
      const html = renderToStaticMarkup(
        <ParcelReportView report={report} boundaryCard={approved} demo={demo} />,
      );
      // The approved card has no map of its own.
      expect(count(html, SHORT)).toBe(1);
      expect(count(html, LONG)).toBe(1);
      const harita = html.indexOf('id="harita"');
      expect(harita).toBeGreaterThan(-1);
      expect(html.indexOf(LONG)).toBeGreaterThan(harita);
      expect(html.indexOf(LONG)).toBeLessThan(html.indexOf('data-testid="boundary-card"'));
    }
  });

  it("no old ad-hoc wording is left", () => {
    expect(JSON.stringify(t.inventoryReport)).not.toContain("tapu sınırı değildir.");
    expect(t.inventory.portal).not.toHaveProperty("note");
  });
});
