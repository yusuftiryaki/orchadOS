import type { ExpressionSpecification } from "maplibre-gl";
import type { Database } from "@/lib/database.types";

export type HealthClass = Database["public"]["Enums"]["health_class"];
// What a slot marker shows: the latest health class, "unassessed" for a tree
// without assessments, "empty" for a slot without an active tree.
export type MarkerState = HealthClass | "unassessed" | "empty";

// MapLibre paint needs concrete colours, so the map colours repeat design
// tokens of src/app/globals.css (docs/tasarim-sistemi.md, Palet). This file is
// the only place they are written down for the maps; tree-style.test.ts reads
// globals.css and fails when a value here no longer equals its token.

// Health classes follow the MVP colour scale (green → red, dead dark, absent
// grey): the --class-* tokens. An empty slot is a white dot with a grey ring
// (MAP_COLORS.emptyRing), as ClassDot draws "Boş yer".
export const MARKER_COLORS: Record<MarkerState, string> = {
  healthy: "#2e9e44",
  attention: "#e3b505",
  problem: "#d9480f",
  dead: "#5c3d2e",
  absent: "#868e96",
  unassessed: "#1c7ed6",
  empty: "#ffffff",
};

// The token each marker colour mirrors.
export const MARKER_COLOR_TOKENS: Record<MarkerState, string> = {
  healthy: "--class-healthy",
  attention: "--class-attention",
  problem: "--class-problem",
  dead: "--class-dead",
  absent: "--class-absent",
  unassessed: "--class-unassessed",
  empty: "--color-surface",
};

// Everything else the maps draw.
export const MAP_COLORS = {
  // Dark ring around every class dot (ClassDot's ring).
  ring: "rgb(43 36 32 / 55%)",
  // Ring of an empty slot ("Boş yer").
  emptyRing: "#868e96",
  // The one highlight: the selected tree, the current panorama and its view,
  // the geometry being drawn (rays, candidate, draft, selected corner).
  highlight: "#a3375a",
  // Parcel boundary, the boundary being drawn, a customer's gardens.
  accent: "#3b6a1e",
  // Dark marks: other panoramas, infrastructure, a marked location.
  ink: "#2b2420",
  // Secondary lines: planting rows, declared and earlier boundaries.
  muted: "#5e5a4f",
  // Halo, white fill.
  surface: "#ffffff",
  // Office tool: a slot flagged for verification; an important finding.
  warning: "#7c5a06",
  // An urgent finding.
  danger: "#a3301f",
  // Office tool: panoramas and the scan track.
  info: "#1f5a99",
  // Interstitial tree (between rows): the fresh-kernel green.
  interstitial: "#b5cf6b",
} as const;

export type MapColor = keyof typeof MAP_COLORS;

export const MAP_COLOR_TOKENS: Record<MapColor, string> = {
  ring: "--class-ring",
  emptyRing: "--class-absent",
  highlight: "--color-highlight",
  accent: "--color-accent",
  ink: "--color-text",
  muted: "--color-muted",
  surface: "--color-surface",
  warning: "--color-warning",
  danger: "--color-danger",
  info: "--color-info",
  interstitial: "--palette-taze",
};

// MapLibre paint for a tree dot: the class colour with the dark ring; an empty
// slot white with the grey ring; the selected one ringed in the highlight.
export const SLOT_STROKE_COLOR: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  MAP_COLORS.highlight,
  ["get", "empty"],
  MAP_COLORS.emptyRing,
  MAP_COLORS.ring,
];

export const SLOT_STROKE_WIDTH: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  3,
  ["get", "empty"],
  1.5,
  1,
];

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
