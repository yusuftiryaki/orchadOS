import type { ErrorEvent, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { t } from "@/lib/i18n";

// Shared MapLibre runtime of the web maps (docs/haritalar.md): one lazy load of
// the library (its chunk is fetched only by pages with a map, and only once),
// Turkish control labels, how a map error is classified, and a test registry
// of live map instances.

type MapLibre = typeof import("maplibre-gl");

let loader: Promise<MapLibre> | null = null;

// maplibre-gl needs `window`; it is loaded only in the browser, the first time
// a map mounts. A failed chunk load is not cached, so a remount retries.
export function loadMapLibre(): Promise<MapLibre> {
  loader ??= import("maplibre-gl").then(
    (lib) => {
      // MapLibre looks for its worker next to its own module file, which does
      // not exist once bundled; point it at the worker emitted as an asset.
      lib.setWorkerUrl(
        new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
      );
      return lib;
    },
    (error: unknown) => {
      loader = null;
      throw error;
    },
  );
  return loader;
}

// Labels of the built-in controls; the canvas gets the map's own label.
export function mapLocale(label: string): Record<string, string> {
  const m = t.map;
  return {
    "Map.Title": label,
    "NavigationControl.ZoomIn": m.zoomIn,
    "NavigationControl.ZoomOut": m.zoomOut,
    "NavigationControl.ResetBearing": m.resetBearing,
    "AttributionControl.ToggleAttribution": m.attribution,
    "FullscreenControl.Enter": m.fullscreenEnter,
    "FullscreenControl.Exit": m.fullscreenExit,
  };
}

// Drawn when the basemap style itself cannot be loaded: a plain background,
// so the overlays (boundary, trees) still show.
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#eef1ea" } }],
};

export type MapErrorKind = "style" | "basemap" | "other";

// Before the style has loaded an error is the style's own (unreachable style
// URL); afterwards an error with a tile or a source id is a basemap tile that
// could not be fetched. Anything else is a real error.
export function classifyMapError(
  event: Pick<ErrorEvent, "error"> & { sourceId?: string; tile?: unknown },
  styleLoaded: boolean,
  overlaySources: ReadonlySet<string> = new Set(),
): MapErrorKind {
  if (!styleLoaded) return "style";
  if (event.tile !== undefined) return "basemap";
  if (event.sourceId !== undefined && !overlaySources.has(event.sourceId)) return "basemap";
  return "other";
}

// Test registry (NEXT_PUBLIC_MAP_TEST_HOOKS=1, set by the browser tests):
// window.__orchadMaps counts maps created and removed, so a test can check
// that navigating between pages does not leak map instances or WebGL contexts.
export interface MapRegistry {
  created: number;
  removed: number;
  live: Set<MapLibreMap>;
}

declare global {
  interface Window {
    __orchadMaps?: MapRegistry;
  }
}

export function mapTestHooks(): boolean {
  return process.env.NEXT_PUBLIC_MAP_TEST_HOOKS === "1";
}

export function registerMap(map: MapLibreMap, enabled = mapTestHooks()): () => void {
  if (!enabled || typeof window === "undefined") return () => {};
  const registry = (window.__orchadMaps ??= { created: 0, removed: 0, live: new Set() });
  registry.created += 1;
  registry.live.add(map);
  return () => {
    if (registry.live.delete(map)) registry.removed += 1;
  };
}
