import type { Database } from "@/lib/database.types";

// The LiDAR size class suggestion of a tree (docs/3d-dunya.md §9.1,
// docs/lidar-olcumleri.md §4): the crown stage writes `size_class` from the
// crown diameter; the office and the expert see it next to the tree's
// recorded age class and accept it with one click. Pure functions.

export type AgeClass = Database["public"]["Enums"]["age_class"];
// The codes `size_class` takes: the age classes without "unknown".
export type SizeClass = Exclude<AgeClass, "unknown">;
export const SIZE_CLASSES: readonly SizeClass[] = ["sapling", "young", "productive", "old"];

// Below this confidence (one sided, touching or leafless crown) the
// suggestion is shown but cannot be accepted with one click.
export const MIN_ACCEPT_CONFIDENCE = 0.5;

export interface SizeSuggestion {
  sizeClass: SizeClass;
  // 0..1; null when the pipeline gave none.
  confidence: number | null;
  sessionId: string;
  measuredAt: string;
}

// A `size_class` measurement row, as read from public.measurement.
export interface SizeClassRow {
  id: string;
  session_id: string;
  tree_id: string | null;
  value_category: string | null;
  confidence: number | null;
  source: string;
  measured_at: string;
  created_at: string;
}

export function isSizeClass(value: unknown): value is SizeClass {
  return typeof value === "string" && (SIZE_CLASSES as readonly string[]).includes(value);
}

// The newest suggestion of each tree: LiDAR (algorithm) rows with a valid
// class, newest measurement first, then the newest row.
export function latestSuggestions(rows: Iterable<SizeClassRow>): Map<string, SizeSuggestion> {
  const best = new Map<string, SizeClassRow>();
  for (const row of rows) {
    if (!row.tree_id || row.source !== "algorithm" || !isSizeClass(row.value_category)) continue;
    const current = best.get(row.tree_id);
    if (!current || newer(row, current)) best.set(row.tree_id, row);
  }
  const out = new Map<string, SizeSuggestion>();
  for (const [treeId, row] of best) {
    out.set(treeId, {
      sizeClass: row.value_category as SizeClass,
      confidence: row.confidence,
      sessionId: row.session_id,
      measuredAt: row.measured_at,
    });
  }
  return out;
}

function newer(a: SizeClassRow, b: SizeClassRow): boolean {
  return (
    (Date.parse(a.measured_at) - Date.parse(b.measured_at) ||
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      (a.id > b.id ? 1 : -1)) > 0
  );
}

// none: no suggestion; match: the recorded class is the suggested one;
// differs: another class (or unknown) and the suggestion can be accepted;
// low: another class, but the confidence is too low to accept with one click.
export type SuggestionState = "none" | "match" | "differs" | "low";

export function suggestionState(
  suggestion: SizeSuggestion | null | undefined,
  recorded: AgeClass,
): SuggestionState {
  if (!suggestion) return "none";
  if (suggestion.sizeClass === recorded) return "match";
  if (suggestion.confidence !== null && suggestion.confidence < MIN_ACCEPT_CONFIDENCE) return "low";
  return "differs";
}

export function canAccept(state: SuggestionState): boolean {
  return state === "differs";
}

// Trees to write when applying the suggestions to a selection: the class each
// gets, grouped by class (one update per class). Trees whose suggestion cannot
// be accepted are counted as skipped.
export function suggestionUpdates(
  trees: { id: string; ageClass: AgeClass }[],
  suggestions: Map<string, SizeSuggestion>,
): { byClass: Map<SizeClass, string[]>; skipped: number } {
  const byClass = new Map<SizeClass, string[]>();
  let skipped = 0;
  for (const tree of trees) {
    const suggestion = suggestions.get(tree.id);
    const state = suggestionState(suggestion, tree.ageClass);
    if (state === "match") continue;
    if (!canAccept(state)) {
      skipped++;
      continue;
    }
    const list = byClass.get(suggestion!.sizeClass) ?? [];
    list.push(tree.id);
    byClass.set(suggestion!.sizeClass, list);
  }
  return { byClass, skipped };
}
