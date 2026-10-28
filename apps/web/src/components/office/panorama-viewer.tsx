"use client";

import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/markers-plugin/index.css";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePanoramaViewer, type PanoramaMarker } from "@/components/panorama/use-panorama-viewer";
import chrome from "@/components/panorama/panorama.module.css";
import { t } from "@/lib/i18n";
import styles from "./office-tool.module.css";

// One equirectangular panorama in Photo Sphere Viewer (one instance per slot,
// kept while stepping through panoramas; see
// components/panorama/use-panorama-viewer.ts). Yaw and pitch are in degrees
// relative to the panorama's centre column (its heading), yaw growing to the
// right, as in the pipeline's sidecar convention. Opens `url` (the preview)
// and switches to `fullUrl` once the user zooms in.

export interface ViewerMarker {
  id: string;
  yawDeg: number;
  pitchDeg: number;
  kind: "click" | "tree";
}

const RAD = Math.PI / 180;

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
  const hintId = useId();
  const onClickRef = useRef(onClick);
  // The image that failed to load (shown as a message; stepping on clears it).
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  const viewerMarkers = useMemo<PanoramaMarker[]>(
    () =>
      markers.map((m) => ({
        id: m.id,
        yawDeg: m.yawDeg,
        pitchDeg: m.pitchDeg,
        html: markerHtml(m.kind),
        size: 14,
      })),
    [markers],
  );

  const { containerRef, loaded, broken, onFocus, onBlur } = usePanoramaViewer({
    panoramaId,
    image: url,
    kind: "preview",
    fullUrl,
    lookYawDeg,
    lookPitchDeg: -10,
    lookVersion,
    defaultZoom: 30,
    markers: viewerMarkers,
    onLoadError: (_id, kind, failed) => {
      if (kind !== "full") setFailedUrl(failed);
    },
    onCreate: (viewer) => {
      viewer.addEventListener("click", ({ data }) => {
        if (data.rightclick) return;
        let yaw = data.yaw / RAD;
        if (yaw > 180) yaw -= 360;
        onClickRef.current(yaw, data.pitch / RAD);
      });
    },
  });
  // Shown again later (the same image opened once more): no stale message.
  const failed = failedUrl === url && !loaded;

  return (
    <div className={chrome.wrap}>
      <div
        ref={containerRef}
        className={`${styles.viewer} ${chrome.frame}`}
        data-panorama={panoramaId}
        data-loaded={loaded ? "true" : "false"}
        data-error={failed ? "true" : undefined}
        aria-label={label}
        aria-describedby={hintId}
        aria-busy={!loaded && !failed && !broken}
        role="region"
        tabIndex={broken ? undefined : 0}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <p id={hintId} className={chrome.visuallyHidden}>
        {t.panorama.keyboardHint}
      </p>
      {broken ? (
        <p className={chrome.error} role="alert" data-testid="viewer-unsupported">
          {t.panorama.unsupported}
        </p>
      ) : failed ? (
        <p className={chrome.error} role="alert" data-testid="viewer-error">
          {t.panorama.loadError}
        </p>
      ) : (
        !loaded && (
          <p className={chrome.status} role="status">
            {t.panorama.loading}
          </p>
        )
      )}
    </div>
  );
}
