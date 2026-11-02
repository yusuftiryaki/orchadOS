import { describe, expect, it } from "vitest";
import {
  effectiveSpecies,
  findingKindApplies,
  hasPistachioMethodology,
  metricApplies,
  PILOT_SPECIES,
  SPECIES_CODE_RE,
  SPECIES_NAMES,
  speciesName,
  treeSpeciesLabel,
} from "./species";

// Fruit species (docs/veri-modeli.md "Meyve türü"): the one place the
// pistachio-only rule lives.

describe("fruit species", () => {
  it("only the pilot species has the pistachio methodology; unknown counts as the pilot", () => {
    expect(PILOT_SPECIES).toBe("antep_fistigi");
    expect(hasPistachioMethodology("antep_fistigi")).toBe(true);
    expect(hasPistachioMethodology(null)).toBe(true);
    expect(hasPistachioMethodology(undefined)).toBe(true);
    for (const code of ["zeytin", "nar", "badem", "diger"]) {
      expect(hasPistachioMethodology(code)).toBe(false);
    }
  });

  it("a tree's own species overrides the parcel's", () => {
    expect(effectiveSpecies({ species: null }, { species: "zeytin" })).toBe("zeytin");
    expect(effectiveSpecies({ species: "nar" }, { species: "zeytin" })).toBe("nar");
    expect(effectiveSpecies({}, {})).toBe(PILOT_SPECIES);
    expect(effectiveSpecies(null, null)).toBe(PILOT_SPECIES);
  });

  it("names a tree's species only when it differs from the parcel's", () => {
    expect(treeSpeciesLabel(null, "zeytin")).toBeNull();
    expect(treeSpeciesLabel("zeytin", "zeytin")).toBeNull();
    expect(treeSpeciesLabel("antep_fistigi", null)).toBeNull();
    expect(treeSpeciesLabel("nar", "zeytin")).toBe("Nar");
  });

  it("names species in Turkish, the code when unknown", () => {
    expect(speciesName("antep_fistigi")).toBe("Antep fıstığı");
    expect(speciesName("incir")).toBe("İncir");
    expect(speciesName("yeni_tur")).toBe("yeni_tur");
    expect(speciesName(null)).toBe("");
    for (const code of Object.keys(SPECIES_NAMES)) expect(SPECIES_CODE_RE.test(code)).toBe(true);
  });

  it("asks pistachio-only metrics and findings for pistachio only", () => {
    expect(metricApplies("pollen_present", "antep_fistigi")).toBe(true);
    expect(metricApplies("pollen_present", "zeytin")).toBe(false);
    expect(metricApplies("pest_sign_type", "zeytin")).toBe(false);
    expect(metricApplies("pest_sign_severity", "zeytin")).toBe(true);
    expect(metricApplies("weed_height", "zeytin")).toBe(true);
    expect(findingKindApplies("pollinizer_ratio", "zeytin")).toBe(false);
    expect(findingKindApplies("pollinizer_ratio", "antep_fistigi")).toBe(true);
    expect(findingKindApplies("dead_branch", "zeytin")).toBe(true);
  });
});
