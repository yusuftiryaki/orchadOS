import { describe, expect, it } from "vitest";
import { loadFruitSpecies, PILOT_SPECIES, SPECIES_NAMES } from "@/lib/species";
import { anonClient } from "./fixtures";

// public.fruit_species (docs/veri-modeli.md "Meyve türü"): the lookup the
// forms list, and the copy of its names in lib/species.ts.

describe("fruit species lookup", () => {
  it("is readable without signing in, in display order, the pilot first", async () => {
    const species = await loadFruitSpecies(anonClient());
    expect(species[0]).toEqual({
      code: PILOT_SPECIES,
      name: "Antep fıstığı",
      hasMethodology: true,
    });
    expect(species.at(-1)?.code).toBe("diger");
    expect(species.filter((s) => s.hasMethodology).map((s) => s.code)).toEqual([PILOT_SPECIES]);
  });

  it("matches the names in lib/species.ts", async () => {
    const species = await loadFruitSpecies(anonClient());
    expect(Object.fromEntries(species.map((s) => [s.code, s.name]))).toEqual(SPECIES_NAMES);
  });
});
