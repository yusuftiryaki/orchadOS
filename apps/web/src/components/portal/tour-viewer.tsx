"use client";

import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { useEffect, useId, useRef } from "react";
import { usePanoramaViewer, type PanoramaMarker } from "@/components/panorama/use-panorama-viewer";
import { t } from "@/lib/i18n";
import type { ImageKind } from "@/lib/portal/tour-view";
import chrome from "@/components/panorama/panorama.module.css";
import styles from "./portal.module.css";

// Photo Sphere Viewer for the tour (one instance for the whole walk; see
// components/panorama/use-panorama-viewer.ts). Starts with the preview image
// and switches to the full resolution once the user zooms in.

export type TourMarker = PanoramaMarker;
export type { ImageKind };

export function TourViewer({
  panoramaId,
  image,
  imageKind,
  fullUrl,
  lookYawDeg,
  lookVersion,
  markers,
  preload,
  onMarker,
  onLoadError,
  onViewChange,
  label,
}: {
  panoramaId: string;
  // null: the image is being signed; the viewer keeps the previous one.
  image: string | null;
  imageKind: ImageKind;
  // Full-resolution image to switch to on zoom, when `image` is the preview.
  fullUrl: string | null;
  lookYawDeg: number;
  lookVersion: number;
  markers: TourMarker[];
  preload: string[];
  onMarker: (id: string) => void;
  onLoadError: (panoramaId: string, kind: ImageKind, url: string) => void;
  // Current yaw (degrees from the centre column), at most every 150 ms.
  onViewChange?: (yawDeg: number) => void;
  label: string;
}) {
  const hintId = useId();
  const callbacks = useRef({ onMarker, onViewChange });
  useEffect(() => {
    callbacks.current = { onMarker, onViewChange };
  }, [onMarker, onViewChange]);
  const { containerRef, shown, loaded, broken, onFocus, onBlur } = usePanoramaViewer({
    panoramaId,
    image,
    kind: imageKind,
    fullUrl,
    lookYawDeg,
    lookPitchDeg: -5,
    lookVersion,
    defaultZoom: 20,
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
    },
  });

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
      />
      <p id={hintId} className={chrome.visuallyHidden}>
        {t.panorama.keyboardHint}
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
