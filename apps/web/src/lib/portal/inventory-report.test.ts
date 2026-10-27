import { describe, expect, it } from "vitest";
import { pdfFileName } from "@/lib/pdf/file-name";
import { buildInventoryReport, type InventoryReportInput } from "./inventory-report";

const tree = (over: Partial<NonNullable<InventoryReportInput["slots"][number]["tree"]>> = {}) => ({
  id: `t-${Math.random()}`,
  sex: "unknown" as const,
  graft: "grafted" as const,
  ageClass: "productive" as const,
  stemForm: "single" as const,
  cultivar: "Kırmızı",
  ...over,
});
const slot = (
  code: string,
  rowNo: number,
  i: number,
  t: ReturnType<typeof tree> | null,
  over: Partial<InventoryReportInput["slots"][number]> = {},
): InventoryReportInput["slots"][number] => ({
  code,
  rowNo,
  kind: "row",
  position: { lat: 37 + rowNo * 0.00007, lon: 37.3 + i * 0.00008 },
  tree: t,
  unsure: false,
  ...over,
});

const input = (over: Partial<InventoryReportInput> = {}): InventoryReportInput => ({
  parcel: {
    id: "p",
    name: "Örnek Bahçe",
    place: "Köy, İlçe",
    estimatedTreeCount: 10,
    estimatedAreaM2: 2000,
  },
  inventory: { sessionId: "s", date: "2026-10-10", approvedAt: "2026-10-12T10:00:00Z" },
  boundary: { version: 2, areaM2: 2100, fieldSurvey: true, approvedAt: null },
  slots: [
    slot("S1-1", 1, 1, tree()),
    slot("S1-2", 1, 2, tree({ graft: "ungrafted", ageClass: "sapling", cultivar: null })),
    slot("S1-3", 1, 3, null),
    slot("S1-3a", 1, 3, tree({ stemForm: "multi" }), { kind: "interstitial" }),
    slot("S2-1", 2, 1, tree({ ageClass: "unknown" })),
    slot("S2-2", 2, 2, tree(), { unsure: true }),
    slot("S2-3", 2, 3, tree({ cultivar: "Uzun" })),
  ],
  zones: [
    { kind: "well", geometry: { type: "Point", coordinates: [37.3, 37] } },
    {
      kind: "fence",
      geometry: {
        type: "LineString",
        coordinates: [
          [37.3, 37],
          [37.301, 37],
        ],
      },
    },
    { kind: "cell", geometry: { type: "Point", coordinates: [37.3, 37] } },
  ],
  measurements: [],
  deadTreeIds: [],
  coverage: { ratio: 0.97, threshold: 0.95, passed: true },
  panoramas: 40,
  ...over,
});

describe("inventory report", () => {
  it("counts slots, trees, structure and infrastructure", () => {
    const r = buildInventoryReport(input());
    expect(r.counts).toEqual({
      slots: 7,
      trees: 6,
      rowTrees: 5,
      interstitialTrees: 1,
      emptySlots: 1,
      rows: 2,
    });
    expect(r.structure.ages).toMatchObject({ productive: 4, sapling: 1, unknown: 1 });
    expect(r.structure.graft).toMatchObject({ grafted: 5, ungrafted: 1 });
    expect(r.structure.stem).toMatchObject({ single: 5, multi: 1 });
    expect(r.structure.cultivars).toEqual([
      { name: "Kırmızı", trees: 4 },
      { name: "Uzun", trees: 1 },
    ]);
    expect(r.infrastructure.map((z) => z.kind)).toEqual(["well", "fence"]);
    // 0.001 degree of longitude at 37°N is ~89 m.
    expect(r.infrastructure[1].lengthM).toBeGreaterThan(85);
    expect(r.infrastructure[1].lengthM).toBeLessThan(92);
    expect(r.confidence.uncertainTrees).toBe(2);
    expect(r.observations).toBeNull();
  });

  it("warns about estimates, empty slots, ungrafted and uncertain trees, the boundary", () => {
    const r = buildInventoryReport(input());
    expect(r.estimate).toEqual({ declared: 10, difference: -4, share: -0.4 });
    expect(r.warnings).toEqual([
      "count_differs",
      "many_empty",
      "ungrafted",
      "uncertain_trees",
      "boundary_unapproved",
    ]);
    const calm = buildInventoryReport(
      input({
        parcel: { ...input().parcel, estimatedTreeCount: 5 },
        boundary: { version: 2, areaM2: 2050, fieldSurvey: true, approvedAt: "2026-10-13" },
        slots: input().slots.filter((s) => s.tree && s.tree.graft !== "ungrafted"),
        coverage: { ratio: 0.9, threshold: 0.95, passed: false },
      }),
    );
    expect(calm.warnings).toEqual(["uncertain_trees", "coverage_below_threshold"]);
  });

  it("first observations count trees, not rows", () => {
    const r = buildInventoryReport(
      input({
        measurements: [
          {
            treeId: "a",
            code: "dieback_pattern",
            scale: null,
            category: "one_sided",
            boolean: null,
          },
          {
            treeId: "a",
            code: "dried_leaves_attached",
            scale: null,
            category: null,
            boolean: true,
          },
          { treeId: "b", code: "dieback_pattern", scale: null, category: "none", boolean: null },
          {
            treeId: "b",
            code: "basal_sprout_level",
            scale: null,
            category: "dense",
            boolean: null,
          },
          { treeId: "c", code: "trunk_base_scale", scale: 2, category: null, boolean: null },
          { treeId: "d", code: "trunk_base_scale", scale: 1, category: null, boolean: null },
        ],
        deadTreeIds: ["e", "e"],
      }),
    );
    expect(r.observations).toEqual({ deadLooking: 1, dieback: 1, denseSprouts: 1, trunkDamage: 1 });
  });

  it("maps slots north up from the south-west corner", () => {
    const r = buildInventoryReport(input());
    const s11 = r.map!.points.find((p) => p.code === "S1-1")!;
    const s23 = r.map!.points.find((p) => p.code === "S2-3")!;
    expect(s11.x).toBeCloseTo(0, 5);
    expect(s11.y).toBeCloseTo(0, 5);
    expect(s23.x).toBeGreaterThan(s11.x);
    expect(s23.y).toBeGreaterThan(s11.y);
    expect(r.map!.points.find((p) => p.code === "S1-3")!.state).toBe("empty");
    expect(r.map!.points.find((p) => p.code === "S2-2")!.state).toBe("uncertain");
  });
});

describe("pdf file names", () => {
  it("are ASCII with the visit day", () => {
    expect(pdfFileName("envanter", "Örnek Bahçe Şahinbey 1", "2026-10-10T08:00:00Z")).toBe(
      "envanter-ornek-bahce-sahinbey-1-2026-10-10.pdf",
    );
    expect(pdfFileName("karne", "İğde", null)).toBe("karne-igde.pdf");
    expect(pdfFileName("karne", "!!!", null)).toBe("karne-bahce.pdf");
  });
});
