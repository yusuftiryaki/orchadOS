"use client";

import type { GeoJSONSource, Map as MapLibreMap, MapOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type RefObject,
} from "react";
import { basemapStyle } from "@/lib/map/basemap";
import {
  classifyMapError,
  FALLBACK_STYLE,
  loadMapLibre,
  mapLocale,
  registerMap,
} from "@/lib/map/maplibre";

type MapLibre = typeof import("maplibre-gl");

export type MapContainer = HTMLDivElement & { __map?: MapLibreMap };

export interface MapState {
  // The style has loaded and onStyle has added the overlays.
  ready: boolean;
  // Basemap tiles (or the style) could not be fetched; overlays still show.
  basemapFailed: boolean;
  // MapLibre could not start (no WebGL, chunk failed to load).
  unsupported: boolean;
}

const INITIAL: MapState = { ready: false, basemapFailed: false, unsupported: false };

// One MapLibre map per component lifetime (or per `deps` change). The map is
// created once the library has loaded; `onStyle` adds the sources, layers and
// handlers as soon as the style is parsed, without waiting for basemap tiles.
// A style that cannot be fetched is replaced by a plain background; tile
// errors set `basemapFailed` instead of reaching the console. On unmount the
// map is removed (which releases its WebGL context).
export function useMapLibre(
  containerRef: RefObject<HTMLDivElement | null>,
  config: {
    label: string;
    options?: () => Omit<MapOptions, "container" | "style">;
    onStyle: (map: MapLibreMap, lib: MapLibre) => void;
    scale?: boolean;
    // GeoJSON sources the component adds; their errors are real errors.
    overlaySources?: readonly string[];
  },
  deps: DependencyList,
): {
  mapRef: RefObject<MapLibreMap | null>;
  setData: (source: string, data: GeoJSON.GeoJSON) => void;
} & MapState {
  const mapRef = useRef<MapLibreMap | null>(null);
  const configRef = useRef(config);
  const [state, setState] = useState<MapState>(INITIAL);

  useEffect(() => {
    configRef.current = config;
  });

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let unregister = () => {};
    const container = containerRef.current as MapContainer | null;

    loadMapLibre().then(
      (lib) => {
        if (cancelled || !container) return;
        const { label, options, scale = true, overlaySources = [] } = configRef.current;
        try {
          map = new lib.Map({
            container,
            style: basemapStyle(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
            locale: mapLocale(label),
            ...options?.(),
          });
        } catch {
          setState({ ...INITIAL, unsupported: true });
          return;
        }
        const m = map;
        mapRef.current = m;
        unregister = registerMap(m);
        m.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        if (scale) m.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
        // Test hook: lets browser tests project positions to pixels.
        container.__map = m;

        let styled = false;
        let fellBack = false;
        const overlays = new Set(overlaySources);
        m.on("error", (event) => {
          const kind = classifyMapError(event, styled, overlays);
          if (kind === "other") {
            console.error(event.error);
            return;
          }
          setState((s) => (s.basemapFailed ? s : { ...s, basemapFailed: true }));
          if (kind === "style" && !fellBack) {
            fellBack = true;
            m.setStyle(FALLBACK_STYLE);
          }
        });
        m.on("style.load", () => {
          if (styled) return;
          styled = true;
          configRef.current.onStyle(m, lib);
          container.dataset.mapReady = "true";
          setState((s) => ({ ...s, ready: true }));
        });
      },
      () => {
        if (!cancelled) setState({ ...INITIAL, unsupported: true });
      },
    );

    return () => {
      cancelled = true;
      unregister();
      map?.remove();
      mapRef.current = null;
      if (container) {
        delete container.dataset.mapReady;
        delete container.__map;
      }
      setState(INITIAL);
    };
    // The caller decides when the map is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Replaces a GeoJSON source's data; a no-op until the style has loaded.
  const setData = useCallback((source: string, data: GeoJSON.GeoJSON) => {
    (mapRef.current?.getSource(source) as GeoJSONSource | undefined)?.setData(data);
  }, []);

  return { mapRef, setData, ...state };
}
