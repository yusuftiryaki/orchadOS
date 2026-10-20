"use client";

import type { Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";
import type { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { useEffect, useRef, useState } from "react";
import styles from "./office-tool.module.css";

// One equirectangular panorama in Photo Sphere Viewer. Yaw and pitch are in
// degrees relative to the panorama's centre column (its heading), yaw growing
// to the right, as in the pipeline's sidecar convention. Opens `url` (the
// preview) and switches to `fullUrl` once the user zooms in.

export interface ViewerMarker {
  id: string;
  yawDeg: number;
  pitchDeg: number;
  kind: "click" | "tree";
}

const RAD = Math.PI / 180;
// Zoom level (0-100) above which the full-resolution image is loaded (as in the portal tour).
const FULL_RES_ZOOM = 55;

function markerHtml(kind: ViewerMarker["kind"]): string {
  return `<div class="${kind === "click" ? styles.clickMarker : styles.treeMarker}"></div>`;
}

export function PanoramaViewer({
  url,
  fullUrl,
  panoramaId,
  lookYawDeg,
  lookVersion,
  markers,
  onClick,
  label,
}: {
  url: string;
  fullUrl: string | null;
  panoramaId: string;
  // Direction to turn to whenever lookVersion changes.
  lookYawDeg: number;
  lookVersion: number;
  markers: ViewerMarker[];
  onClick: (yawDeg: number, pitchDeg: number) => void;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markersRef = useRef<MarkersPlugin | null>(null);
  const [ready, setReady] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const onClickRef = useRef(onClick);
  const initial = useRef({ url, lookYawDeg });
  // Full-resolution image still to load for the shown panorama, if any.
  const fullRef = useRef<string | null>(fullUrl);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

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
        panorama: initial.current.url,
        defaultYaw: initial.current.lookYawDeg * RAD,
        defaultPitch: -10 * RAD,
        defaultZoomLvl: 30,
        navbar: ["zoom", "move", "fullscreen"],
        loadingTxt: "…",
        plugins: [[markersModule.MarkersPlugin, {}]],
      });
      viewerRef.current = viewer;
      markersRef.current = viewer.getPlugin(markersModule.MarkersPlugin) as MarkersPlugin;
      // Test hook: lets browser tests turn spherical coordinates into pixels.
      (container as HTMLDivElement & { __viewer?: Viewer }).__viewer = viewer;
      viewer.addEventListener("click", ({ data }) => {
        if (data.rightclick) return;
        let yaw = data.yaw / RAD;
        if (yaw > 180) yaw -= 360;
        onClickRef.current(yaw, data.pitch / RAD);
      });
      viewer.addEventListener("zoom-updated", ({ zoomLevel }) => {
        const v = viewerRef.current;
        const full = fullRef.current;
        if (!v || !full || zoomLevel < FULL_RES_ZOOM) return;
        fullRef.current = null;
        void v.setPanorama(full, {
          position: v.getPosition(),
          zoom: zoomLevel,
          transition: false,
          showLoader: false,
        });
      });
      viewer.addEventListener("ready", () => setReady(true), { once: true });
      viewer.addEventListener("panorama-loaded", () =>
        setLoadedId(container.dataset.panorama ?? null),
      );
    });
    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Panorama changes: load the new image and turn towards the target.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer) return;
    // Same panorama (preview, or already switched to full resolution): just turn.
    if (viewer.config.panorama === url || (fullUrl && viewer.config.panorama === fullUrl)) {
      viewer.rotate({ yaw: lookYawDeg * RAD, pitch: -10 * RAD });
      return;
    }
    fullRef.current = fullUrl;
    setLoadedId(null);
    void viewer.setPanorama(url, {
      position: { yaw: lookYawDeg * RAD, pitch: -10 * RAD },
      transition: false,
      showLoader: true,
    });
    // lookVersion re-runs this when the user clicks the map again.
  }, [ready, url, fullUrl, lookYawDeg, lookVersion]);

  useEffect(() => {
    const plugin = markersRef.current;
    if (!ready || !plugin) return;
    plugin.setMarkers(
      markers.map((m) => ({
        id: m.id,
        position: { yaw: m.yawDeg * RAD, pitch: m.pitchDeg * RAD },
        html: markerHtml(m.kind),
        anchor: "center center",
        size: { width: 14, height: 14 },
      })),
    );
  }, [ready, markers, loadedId]);

  return (
    <div
      ref={containerRef}
      className={styles.viewer}
      data-panorama={panoramaId}
      data-loaded={loadedId === panoramaId ? "true" : "false"}
      aria-label={label}
      role="region"
    />
  );
}
