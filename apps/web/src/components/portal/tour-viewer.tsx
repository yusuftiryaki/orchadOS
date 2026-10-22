"use client";

import type { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";
import type { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { useEffect, useRef, useState } from "react";
import styles from "./portal.module.css";

// Photo Sphere Viewer for the tour. Yaw is in degrees relative to the
// panorama's centre column (its heading), rightwards positive, as in the
// pipeline convention. Starts with the preview image and switches to the full
// resolution once the user zooms in.

export interface TourMarker {
  id: string;
  yawDeg: number;
  pitchDeg: number;
  html: string;
  tooltip: string;
  size: number;
}

export type ImageKind = "placeholder" | "preview" | "full";

const RAD = Math.PI / 180;
// Zoom level (0-100) above which the full-resolution image is loaded.
const FULL_RES_ZOOM = 55;

export function TourViewer({
  panoramaId,
  image,
  imageKind,
  fullUrl,
  lookYawDeg,
  lookVersion,
  markers,
  onMarker,
  onLoadError,
  onViewChange,
  label,
}: {
  panoramaId: string;
  image: string;
  imageKind: ImageKind;
  // Full-resolution image to switch to on zoom, when `image` is the preview.
  fullUrl: string | null;
  lookYawDeg: number;
  lookVersion: number;
  markers: TourMarker[];
  onMarker: (id: string) => void;
  onLoadError: (panoramaId: string) => void;
  // Current yaw (degrees from the centre column), at most every 150 ms.
  onViewChange?: (yawDeg: number) => void;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markersRef = useRef<MarkersPlugin | null>(null);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState<{ id: string; kind: ImageKind } | null>(null);
  const callbacks = useRef({ onMarker, onLoadError, onViewChange });
  const initial = useRef({ image, lookYawDeg });
  const fullRef = useRef<{ id: string; url: string | null }>({ id: panoramaId, url: fullUrl });

  useEffect(() => {
    callbacks.current = { onMarker, onLoadError, onViewChange };
  }, [onMarker, onLoadError, onViewChange]);

  useEffect(() => {
    fullRef.current = { id: panoramaId, url: imageKind === "preview" ? fullUrl : null };
  }, [panoramaId, imageKind, fullUrl]);

  useEffect(() => {
    let cancelled = false;
    let viewer: Viewer | null = null;
    Promise.all([
      import("@photo-sphere-viewer/core"),
      import("@photo-sphere-viewer/markers-plugin"),
    ]).then(([core, markersModule]) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      viewer = new core.Viewer({
        container,
        panorama: initial.current.image,
        defaultYaw: initial.current.lookYawDeg * RAD,
        defaultPitch: -5 * RAD,
        defaultZoomLvl: 20,
        navbar: ["zoom", "move", "fullscreen"],
        loadingTxt: "…",
        plugins: [[markersModule.MarkersPlugin, {}]],
      });
      viewerRef.current = viewer;
      const plugin = viewer.getPlugin(markersModule.MarkersPlugin) as MarkersPlugin;
      markersRef.current = plugin;
      // Test hook: lets browser tests read the view and click markers.
      (container as HTMLDivElement & { __viewer?: Viewer }).__viewer = viewer;
      plugin.addEventListener("select-marker", ({ marker }) => {
        callbacks.current.onMarker(marker.id);
      });
      viewer.addEventListener("ready", () => setReady(true), { once: true });
      let lastView = 0;
      viewer.addEventListener("position-updated", ({ position }) => {
        const now = Date.now();
        if (now - lastView < 150) return;
        lastView = now;
        callbacks.current.onViewChange?.(position.yaw / RAD);
      });
      viewer.addEventListener("zoom-updated", ({ zoomLevel }) => {
        const v = viewerRef.current;
        const full = fullRef.current;
        if (!v || !full.url || zoomLevel < FULL_RES_ZOOM) return;
        const url = full.url;
        fullRef.current = { id: full.id, url: null };
        void v
          .setPanorama(url, {
            position: v.getPosition(),
            zoom: zoomLevel,
            transition: false,
            showLoader: false,
          })
          .then(() => setShown({ id: full.id, kind: "full" }))
          .catch(() => undefined);
      });
    });
    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // A new panorama (or a new image for it): load it and turn to the target.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer) return;
    const position = { yaw: lookYawDeg * RAD, pitch: -5 * RAD };
    if (viewer.config.panorama === image) {
      viewer.rotate(position);
      setShown({ id: panoramaId, kind: imageKind });
      return;
    }
    let cancelled = false;
    viewer
      .setPanorama(image, { position, transition: false, showLoader: true })
      .then(() => {
        if (!cancelled) setShown({ id: panoramaId, kind: imageKind });
      })
      .catch(() => {
        if (!cancelled && imageKind !== "placeholder") callbacks.current.onLoadError(panoramaId);
      });
    return () => {
      cancelled = true;
    };
    // lookVersion re-runs this when the user asks for a direction again.
  }, [ready, image, imageKind, panoramaId, lookYawDeg, lookVersion]);

  useEffect(() => {
    const plugin = markersRef.current;
    if (!ready || !plugin) return;
    plugin.setMarkers(
      markers.map((m) => ({
        id: m.id,
        position: { yaw: m.yawDeg * RAD, pitch: m.pitchDeg * RAD },
        html: m.html,
        anchor: "center center",
        size: { width: m.size, height: m.size },
        tooltip: { content: m.tooltip, position: "top center" },
      })),
    );
  }, [ready, markers, shown]);

  return (
    <div
      ref={containerRef}
      className={styles.viewer}
      data-testid="tour-viewer"
      data-panorama={panoramaId}
      data-loaded={shown?.id === panoramaId ? "true" : "false"}
      data-image={shown?.id === panoramaId ? shown.kind : ""}
      aria-label={label}
      role="region"
    />
  );
}
