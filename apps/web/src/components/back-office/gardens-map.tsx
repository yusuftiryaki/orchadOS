"use client";

import { useRef } from "react";
import { MapStatus } from "@/components/map/map-status";
import mapStyles from "@/components/map/map.module.css";
import { useMapLibre } from "@/components/map/use-maplibre";
import styles from "@/components/operations/operations.module.css";
import { t } from "@/lib/i18n";
import { closeRing, paddedBounds } from "@/lib/map/features";
import type { Position } from "@/lib/map/geo";
import { MAP_COLORS } from "@/lib/map/tree-style";

const ACCENT = MAP_COLORS.accent;
// A garden known only by its location: a dark dot.
const POSITION = MAP_COLORS.ink;
// The customer's existing parcels (IP14): a muted second layer.
const MUTED = MAP_COLORS.muted;

export interface MapGarden {
  id: string;
  name: string;
  position: Position | null;
  boundary: Position[] | null;
}

const NONE: MapGarden[] = [];

function features(gardens: MapGarden[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: gardens.flatMap((g): GeoJSON.Feature[] => [
      ...(g.boundary && g.boundary.length >= 3
        ? [
            {
              type: "Feature" as const,
              geometry: {
                type: "Polygon" as const,
                coordinates: [closeRing(g.boundary)],
              },
              properties: { name: g.name },
            },
          ]
        : []),
      ...(g.position
        ? [
            {
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: g.position },
              properties: { name: g.name },
            },
          ]
        : []),
    ]),
  };
}

// Read-only map of an application's gardens: the marked locations and the
// boundaries the customer drew; the customer's existing parcels, when given,
// in a muted layer below.
export function GardensMap({
  gardens,
  existing = NONE,
  label,
}: {
  gardens: MapGarden[];
  existing?: MapGarden[];
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const state = useMapLibre(
    containerRef,
    {
      label,
      scale: false,
      overlaySources: ["existing", "gardens"],
      options: () => {
        const bounds = paddedBounds(
          [...gardens, ...existing].flatMap((g) => [
            ...(g.position ? [g.position] : []),
            ...(g.boundary ?? []),
          ]),
        );
        return bounds
          ? { bounds, fitBoundsOptions: { padding: 32, maxZoom: 17 } }
          : { center: [37.38, 37.07], zoom: 9 };
      },
      onStyle: (m) => {
        m.addSource("existing", { type: "geojson", data: features(existing) });
        m.addLayer({
          id: "existing-fill",
          type: "fill",
          source: "existing",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": MUTED, "fill-opacity": 0.1 },
        });
        m.addLayer({
          id: "existing-line",
          type: "line",
          source: "existing",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "line-color": MUTED, "line-width": 1, "line-dasharray": [2, 2] },
        });
        m.addLayer({
          id: "existing-point",
          type: "circle",
          source: "existing",
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-color": MUTED, "circle-radius": 4, "circle-opacity": 0.7 },
        });
        m.addSource("gardens", { type: "geojson", data: features(gardens) });
        m.addLayer({
          id: "gardens-fill",
          type: "fill",
          source: "gardens",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": ACCENT, "fill-opacity": 0.15 },
        });
        m.addLayer({
          id: "gardens-line",
          type: "line",
          source: "gardens",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "line-color": ACCENT, "line-width": 2 },
        });
        m.addLayer({
          id: "gardens-point",
          type: "circle",
          source: "gardens",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": POSITION,
            "circle-stroke-color": MAP_COLORS.surface,
            "circle-stroke-width": 2,
            "circle-radius": 6,
          },
        });
      },
    },
    // Rebuilt when the places change, not on every server refresh of the page.
    [JSON.stringify([gardens, existing])],
  );
  const hasPlaces = [...gardens, ...existing].some((g) => g.position || g.boundary?.length);

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.drawMap} ${mapStyles.base}`}
        data-testid="gardens-map"
        role="img"
        aria-label={label}
      />
      <MapStatus state={state} empty={hasPlaces ? null : t.map.noFeatures} />
    </>
  );
}
