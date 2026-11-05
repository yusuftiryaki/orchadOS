"use client";

import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePanoramaViewer, type PanoramaMarker } from "@/components/panorama/use-panorama-viewer";
import { t } from "@/lib/i18n";
import { prefersReducedMotion } from "@/lib/map/motion";
import { animateView } from "@/lib/panorama/runtime";
import { doubleClickZoom, TOUR_FOV, treeFocusZoom } from "@/lib/panorama/zoom";
import type { ImageKind } from "@/lib/portal/tour-view";
import chrome from "@/components/panorama/panorama.module.css";
import styles from "./portal.module.css";

// Photo Sphere Viewer for the tour (one instance for the whole walk; see
// components/panorama/use-panorama-viewer.ts). Starts with the preview image
// and switches to the full resolution once the user zooms in.
//
// Zooming: the mouse wheel, two fingers, the toolbar and +/− as in PSV; a
// double click (double tap) zooms one step towards that point; a tree
// focus turns to the tree and zooms until its crown fills the view; the
// overview button returns to the opening zoom. Overlays (the caller's tree
// panel, the overview button) are rendered inside the viewer's element, so
// they stay on screen in fullscreen.

export type TourMarker = PanoramaMarker;
export type { ImageKind };

// Opening zoom and pitch, and the zoom a walk to the next panorama returns to.
export const TOUR_DEFAULT_ZOOM = 20;
export const TOUR_DEFAULT_PITCH = -5;
// Zoomed in this far past the overview: offer the way back.
const ZOOMED_IN_MARGIN = 8;

export interface TourFocus {
  // The tree to turn to and zoom on; null: back to the overview.
  target: { yawDeg: number; pitchDeg: number; distanceM: number } | null;
  // Bumped by each request; walking clears the tree without a bump.
  version: number;
}

export function TourViewer({
  panoramaId,
  image,
  imageKind,
  fullUrl,
  lookYawDeg,
  lookZoom,
  lookVersion,
  focus,
  markers,
  preload,
  onMarker,
  onLoadError,
  onViewChange,
  onEscape,
  label,
  children,
}: {
  panoramaId: string;
  // null: the image is being signed; the viewer keeps the previous one.
  image: string | null;
  imageKind: ImageKind;
  // Full-resolution image to switch to on zoom, when `image` is the preview.
  fullUrl: string | null;
  lookYawDeg: number;
  // Zoom the next panorama opens at; null keeps the current one.
  lookZoom: number | null;
  lookVersion: number;
  focus: TourFocus;
  markers: TourMarker[];
  preload: string[];
  onMarker: (id: string) => void;
  onLoadError: (panoramaId: string, kind: ImageKind, url: string) => void;
  // Current yaw (degrees from the centre column), at most every 150 ms.
  onViewChange?: (yawDeg: number) => void;
  // Escape pressed while the viewer (or a control in it) has the focus.
  onEscape?: () => void;
  label: string;
  // Overlays over the photo (e.g. the focused tree's panel).
  children?: ReactNode;
}) {
  const hintId = useId();
  const callbacks = useRef({ onMarker, onViewChange });
  useEffect(() => {
    callbacks.current = { onMarker, onViewChange };
  }, [onMarker, onViewChange]);
  const [zoomedIn, setZoomedIn] = useState(false);
  const { containerRef, viewer, shown, loaded, broken, onFocus, onBlur } = usePanoramaViewer({
    panoramaId,
    image,
    kind: imageKind,
    fullUrl,
    lookYawDeg,
    lookPitchDeg: TOUR_DEFAULT_PITCH,
    lookZoom,
    lookVersion,
    defaultZoom: TOUR_DEFAULT_ZOOM,
    fov: TOUR_FOV,
    markers,
    preload,
    onLoadError: (id, kind, url) => onLoadError(id, kind as ImageKind, url),
    onCreate: (viewer, plugin) => {
      plugin.addEventListener("select-marker", ({ marker }) => {
        callbacks.current.onMarker(marker.id);
      });
      let lastView = 0;
      viewer.addEventListener("position-updated", ({ position }) => {
        const now = Date.now();
        if (now - lastView < 150) return;
        lastView = now;
        callbacks.current.onViewChange?.(position.yaw / (Math.PI / 180));
      });
      viewer.addEventListener("zoom-updated", ({ zoomLevel }) => {
        setZoomedIn(zoomLevel > TOUR_DEFAULT_ZOOM + ZOOMED_IN_MARGIN);
      });
      // Double click or double tap on the photo (not on a marker): one step
      // closer, centred on that point.
      viewer.addEventListener("dblclick", ({ data }) => {
        if ((data.target as Element | null)?.closest?.(".psv-marker")) return;
        animateView(
          viewer,
          {
            yawDeg: data.yaw / (Math.PI / 180),
            pitchDeg: data.pitch / (Math.PI / 180),
            zoom: doubleClickZoom(viewer.getZoomLevel(), TOUR_DEFAULT_ZOOM),
          },
          prefersReducedMotion(),
        );
      });
    },
  });

  const overview = useCallback(() => {
    if (!viewer) return;
    animateView(
      viewer,
      { pitchDeg: TOUR_DEFAULT_PITCH, zoom: TOUR_DEFAULT_ZOOM },
      prefersReducedMotion(),
    );
  }, [viewer]);

  // A focus request: turn to the tree and zoom on it, or back to the overview.
  const handled = useRef(focus.version);
  const focusTarget = useRef(focus.target);
  useEffect(() => {
    focusTarget.current = focus.target;
  });
  useEffect(() => {
    if (!viewer || !loaded || handled.current === focus.version) return;
    handled.current = focus.version;
    const target = focusTarget.current;
    if (!target) {
      overview();
      return;
    }
    animateView(
      viewer,
      {
        yawDeg: target.yawDeg,
        pitchDeg: target.pitchDeg,
        zoom: treeFocusZoom(target.distanceM, TOUR_FOV, TOUR_DEFAULT_ZOOM),
      },
      prefersReducedMotion(),
    );
  }, [viewer, loaded, focus.version, overview]);

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.viewer} ${chrome.frame}`}
        data-testid="tour-viewer"
        data-panorama={panoramaId}
        data-loaded={loaded ? "true" : "false"}
        data-image={loaded ? shown!.kind : ""}
        aria-label={label}
        aria-describedby={hintId}
        aria-busy={!loaded && !broken}
        role="region"
        tabIndex={broken ? undefined : 0}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Escape" && onEscape) onEscape();
        }}
      >
        {loaded && children}
        {loaded && zoomedIn && !focus.target && (
          <button
            type="button"
            className={styles.overviewButton}
            data-testid="tour-overview"
            onClick={overview}
          >
            <span aria-hidden="true">⤢</span> {t.portal.tour.overview}
          </button>
        )}
      </div>
      <p id={hintId} className={chrome.visuallyHidden}>
        {t.panorama.keyboardHint} {t.portal.tour.zoomHint}
      </p>
      {broken ? (
        <p className={chrome.error} role="alert" data-testid="tour-unsupported">
          {t.panorama.unsupported}
        </p>
      ) : (
        !loaded && (
          <p className={chrome.status} role="status" data-testid="tour-loading">
            {t.panorama.loading}
          </p>
        )
      )}
    </>
  );
}
