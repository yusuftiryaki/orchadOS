import type { Client } from "@/lib/supabase/types";

// Fruit species (meyve türü, docs/veri-modeli.md "Meyve türü"). orchadOS
// serves all fruit orchards; Antep pistachio is the pilot and the only species
// with a methodology so far (docs/metodoloji.md "Kapsam"). Pistachio-only
// parts (tree sex, the male/female ratio, the pollinizer finding, pistachio
// texts) are shown only when the effective species is the pilot's; other
// species get generic monitoring (inventory, panorama tour, general health,
// care, weed). This module is the one place that rule lives.

export const PILOT_SPECIES = "antep_fistigi";

// Names of public.fruit_species (written by migrations only; the
// fruit-species integration test keeps this list equal to the table). Used to
// label a species where loading the table would be one more round trip; forms
// list the options from the table (loadFruitSpecies).
export const SPECIES_NAMES: Readonly<Record<string, string>> = {
  antep_fistigi: "Antep fıstığı",
  zeytin: "Zeytin",
  mandalina: "Mandalina",
  portakal: "Portakal",
  limon: "Limon",
  greyfurt: "Greyfurt",
  nar: "Nar",
  incir: "İncir",
  kayisi: "Kayısı",
  kiraz: "Kiraz",
  elma: "Elma",
  ceviz: "Ceviz",
  badem: "Badem",
  diger: "Diğer",
};

// The Turkish name of a species code; the code itself when unknown.
export function speciesName(code: string | null | undefined): string {
  if (!code) return "";
  return SPECIES_NAMES[code] ?? code;
}

// The pistachio methodology (sex, pollinizer ratio, pistachio texts)
// applies. Null (not yet known) counts as the pilot: rows written before
// species existed are the pilot's.
export function hasPistachioMethodology(species: string | null | undefined): boolean {
  return (species ?? PILOT_SPECIES) === PILOT_SPECIES;
}

// A tree's species: its own override, else the parcel's (public.tree_species).
export function effectiveSpecies(
  tree: { species?: string | null } | null | undefined,
  parcel: { species?: string | null } | null | undefined,
): string {
  return tree?.species || parcel?.species || PILOT_SPECIES;
}

// The species to show next to a tree: only when it differs from the parcel's.
export function treeSpeciesLabel(
  treeSpecies: string | null | undefined,
  parcelSpecies: string | null | undefined,
): string | null {
  if (!treeSpecies || treeSpecies === (parcelSpecies || PILOT_SPECIES)) return null;
  return speciesName(treeSpecies);
}

// Metrics (metric_definition codes) of the pistachio methodology only: the
// pest types of the pistachio (psylla, bud borer, stink bug), the psylla's
// white flakes, the pollen of a male tree and the emptied cluster stalk.
// Every other metric is generic monitoring (general health, care, weed).
export const PISTACHIO_ONLY_METRICS: readonly string[] = [
  "pest_sign_type",
  "white_flakes_present",
  "pollen_present",
  "early_emptied_cluster_present",
];

// A metric is asked and shown for this species.
export function metricApplies(code: string, species: string | null | undefined): boolean {
  return hasPistachioMethodology(species) || !PISTACHIO_ONLY_METRICS.includes(code);
}

// Finding kinds of the pistachio methodology only (male/female ratio).
export const PISTACHIO_ONLY_FINDINGS: readonly string[] = ["pollinizer_ratio"];

export function findingKindApplies(kind: string, species: string | null | undefined): boolean {
  return hasPistachioMethodology(species) || !PISTACHIO_ONLY_FINDINGS.includes(kind);
}

// A species code as forms accept it (the database checks it is listed).
export const SPECIES_CODE_RE = /^[a-z][a-z0-9_]{1,31}$/;

export interface FruitSpecies {
  code: string;
  name: string;
  hasMethodology: boolean;
}

// The active species for the forms, in their display order.
export async function loadFruitSpecies(supabase: Client): Promise<FruitSpecies[]> {
  const { data, error } = await supabase
    .from("fruit_species")
    .select("code, name, has_methodology")
    .eq("active", true)
    .order("sort_order")
    .order("code");
  if (error) throw error;
  return data.map((s) => ({ code: s.code, name: s.name, hasMethodology: s.has_methodology }));
}
