import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { t } from "@/lib/i18n";
import type { WorkspaceSlot } from "@/lib/office/inventory-workspace";
import type { SlotProperties } from "@/lib/parcels";
import type { ParcelReport } from "@/lib/portal/data";
import { structureDimension } from "@/lib/portal/dimensions";
import { buildInventoryReport } from "@/lib/portal/inventory-report";
import { FindingForm } from "./expert/finding-form";
import { TreeAttributeEditor } from "./office/tree-attribute-editor";
import { Dimensions } from "./portal/dimensions";
import { SpeciesNotice } from "./species-notice";
import { TreePanel } from "./tree-panel";

// Pistachio-only parts (tree sex, the male/female ratio, the pollinizer
// finding, pistachio texts) appear only for the pilot species
// (lib/species.ts); other species are labelled "genel izleme".

vi.mock("@/app/uzman/actions", () => ({ saveFindingAction: async () => {} }));

const SEX = t.tree.sex;

const slot = (species: string, speciesLabel: string | null = null): SlotProperties => ({
  slotId: "s1",
  code: "S1-1",
  kind: "row",
  state: "unassessed",
  tree: {
    id: "t1",
    sex: "female",
    graft: "grafted",
    ageClass: "productive",
    stemForm: "single",
    cultivar: null,
    status: "active",
    firstSeenAt: null,
    health: null,
    species,
    speciesLabel,
  },
});

describe("tree panel", () => {
  it("shows the sex for a pistachio tree", () => {
    const html = renderToStaticMarkup(
      <TreePanel slot={slot("antep_fistigi")} onClose={() => {}} />,
    );
    expect(html).toContain(SEX);
    expect(html).not.toContain('data-testid="tree-species"');
  });

  it("hides the sex for an olive tree and names a species that differs from the parcel's", () => {
    const html = renderToStaticMarkup(
      <TreePanel slot={slot("zeytin", "Zeytin")} onClose={() => {}} />,
    );
    expect(html).not.toContain(SEX);
    expect(html).toContain('data-testid="tree-species"');
    expect(html).toContain("Zeytin");
  });
});

const wsSlot = (code: string, species: string | null): WorkspaceSlot =>
  ({
    id: code,
    code,
    rowNo: 1,
    positionNo: 1,
    suffix: null,
    kind: "row",
    position: null,
    uncertaintyM: null,
    unsure: false,
    tree: {
      id: `t-${code}`,
      sex: "unknown",
      graft: "grafted",
      ageClass: "productive",
      stemForm: "single",
      cultivar: null,
      species,
    },
  }) as WorkspaceSlot;

const OPTIONS = [
  { code: "antep_fistigi", name: "Antep fıstığı", hasMethodology: true },
  { code: "zeytin", name: "Zeytin", hasMethodology: false },
];

const editor = (parcelSpecies: string, slots: WorkspaceSlot[]) =>
  renderToStaticMarkup(
    <TreeAttributeEditor
      slots={slots}
      selected={new Set()}
      onSelectionChange={() => {}}
      onApply={async () => ({ ok: true, updated: 0 })}
      showSex
      parcelSpecies={parcelSpecies}
      speciesOptions={OPTIONS}
    />,
  );

describe("tree attribute editor", () => {
  it("offers the species override with the parcel's species as the default choice", () => {
    const html = editor("zeytin", [wsSlot("S1-1", null)]);
    expect(html).toContain('data-testid="bulk-species"');
    expect(html).toContain(t.species.parcelDefault("Zeytin"));
  });

  it("asks the sex on a pistachio parcel only", () => {
    expect(editor("antep_fistigi", [wsSlot("S1-1", null)])).toContain('data-testid="bulk-sex"');
    const olive = editor("zeytin", [wsSlot("S1-1", null)]);
    expect(olive).not.toContain('data-testid="bulk-sex"');
    expect(olive).not.toContain(`<th>${t.inventory.attributes.columns.sex}</th>`);
  });

  it("shows the sex column for a pistachio tree in an olive orchard", () => {
    const html = editor("zeytin", [wsSlot("S1-1", null), wsSlot("S1-2", "antep_fistigi")]);
    expect(html).toContain(`<th>${t.inventory.attributes.columns.sex}</th>`);
    expect(html).toContain("Antep fıstığı");
  });
});

describe("finding form", () => {
  const form = (species?: string) =>
    renderToStaticMarkup(
      <FindingForm
        sessionId="s"
        treeId={null}
        returnPath="/uzman"
        evidenceOptions={[]}
        submitLabel="Ekle"
        species={species}
      />,
    );
  it("offers the pollinizer ratio finding for pistachio only", () => {
    expect(form("antep_fistigi")).toContain('value="pollinizer_ratio"');
    expect(form()).toContain('value="pollinizer_ratio"');
    expect(form("zeytin")).not.toContain('value="pollinizer_ratio"');
    expect(form("zeytin")).toContain('value="dead_branch"');
  });
});

describe("generic monitoring notice", () => {
  it("labels other species, not the pilot", () => {
    expect(renderToStaticMarkup(<SpeciesNotice species="antep_fistigi" />)).toBe("");
    const html = renderToStaticMarkup(<SpeciesNotice species="zeytin" />);
    expect(html).toContain(t.species.genericMonitoring);
    expect(html).toContain("bu tür için metodoloji henüz yok");
  });
});

describe("portal report card and inventory report", () => {
  const dims = (species: string) =>
    renderToStaticMarkup(
      <Dimensions
        base="/portal/parsel/p"
        report={
          {
            parcel: { species },
            latest: { id: "v" },
            coverage: {},
            audit: null,
            dimensions: {
              inventory: {
                slots: 2,
                trees: 2,
                emptySlots: 0,
                interstitial: 0,
                lost: null,
                added: null,
              },
              structure: structureDimension([
                {
                  code: "S1-1",
                  rowNo: 1,
                  kind: "row",
                  trees: [
                    {
                      id: "a",
                      status: "active",
                      sex: "female",
                      graft: "grafted",
                      ageClass: "productive",
                      firstSeenAt: null,
                      lostAt: null,
                    },
                  ],
                },
              ]),
              care: { pruning: null, harvest: null, sprouts: null, weedHeight: null, ownWork: [] },
              pests: null,
              fruitLoad: null,
              pattern: { issues: 0, halfOfIssuesIn: 0, cells: 0, hotCells: 0 },
            },
          } as unknown as ParcelReport
        }
      />,
    );

  it("shows the male/female line for pistachio only", () => {
    expect(dims("antep_fistigi")).toContain('data-testid="structure-sex"');
    expect(dims("antep_fistigi")).toContain(t.portal.dimensions.ratioUnknown);
    expect(dims("zeytin")).not.toContain('data-testid="structure-sex"');
    expect(dims("zeytin")).not.toContain(t.portal.dimensions.ratioUnknown);
  });

  it("keeps the pistachio text out of the ungrafted warning of other species", () => {
    const report = (species: string) =>
      buildInventoryReport({
        parcel: {
          id: "p",
          name: "Örnek",
          place: "Köy",
          estimatedTreeCount: null,
          estimatedAreaM2: null,
          species,
        },
        inventory: null,
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
              graft: "ungrafted",
              ageClass: "productive",
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
      }).warnings;
    expect(report("antep_fistigi")).toContain("ungrafted");
    expect(report("zeytin")).toContain("ungrafted_generic");
    expect(report("zeytin")).not.toContain("ungrafted");
    expect(t.inventoryReport.warnings.ungrafted_generic).not.toMatch(/fıstık/);
  });
});
