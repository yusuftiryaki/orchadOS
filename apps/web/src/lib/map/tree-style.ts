import type { Database } from "@/lib/database.types";

export type HealthClass = Database["public"]["Enums"]["health_class"];
// What a slot marker shows: the latest health class, "unassessed" for a tree
// without assessments, "empty" for a slot without an active tree.
export type MarkerState = HealthClass | "unassessed" | "empty";

// Health classes follow the MVP colour scale (green → red, dead dark, absent grey).
export const MARKER_COLORS: Record<MarkerState, string> = {
  healthy: "#2e9e44",
  attention: "#e3b505",
  problem: "#d9480f",
  dead: "#5c3d2e",
  absent: "#868e96",
  unassessed: "#1c7ed6",
  empty: "#ffffff",
};

export const MARKER_ORDER: MarkerState[] = [
  "healthy",
  "attention",
  "problem",
  "dead",
  "absent",
  "unassessed",
  "empty",
];

export function markerState(hasActiveTree: boolean, health: HealthClass | null): MarkerState {
  if (!hasActiveTree) return "empty";
  return health ?? "unassessed";
}

// Legend entries for the states that actually occur, in a fixed order. With no
// assessments in the data every tree is "unassessed", i.e. a single colour.
export function legendStates(states: Iterable<MarkerState>): MarkerState[] {
  const present = new Set(states);
  return MARKER_ORDER.filter((state) => present.has(state));
}
