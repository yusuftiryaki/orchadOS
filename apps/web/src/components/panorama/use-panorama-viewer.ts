"use client";

import type { Cache as PsvCache, Viewer } from "@photo-sphere-viewer/core";
import type { MarkersPlugin } from "@photo-sphere-viewer/markers-plugin";
import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { t } from "@/lib/i18n";
import { prefersReducedMotion } from "@/lib/map/motion";
import {
  destroyViewer,
  fetchPanorama,
  isAbortError,
  labelNavbarButtons,
  loadPhotoSphere,
  prefetchPanoramas,
  webglAvailable,
} from "@/lib/panorama/runtime";

// One Photo Sphere Viewer for a sequence of panoramas (office tool, portal
// tour). The viewer is created once and every panorama goes through
// setPanorama; images are downloaded into PSV's cache first (so a failed
// download never shows PSV's English error box), the full resolution follows
// once the user zooms in, and unmounting frees the WebGL context.
//
// Yaw and pitch are in degrees relative to the panorama's centre column (its
// heading), yaw growing to the right, as in the pipeline's sidecar convention.

const RAD = Math.PI / 180;
// Zoom level (0-100) above which the full-resolution image is loaded.
export const FULL_RES_ZOOM = 55;

export interface PanoramaMarker {
  id: string;
  yawDeg: number;
  pitchDeg: number;
  html: string;
  size: number;
  tooltip?: string;
}

export interface ShownPanorama {
  id: string;
  // The caller's kind of the shown image ("full" after the zoom switch).
  kind: string;
}

export interface PanoramaViewerOptions {
  panoramaId: string;
  // Image to show; null keeps the current one while the caller waits for a URL.
  image: string | null;
  kind: string;
  // Full resolution to switch to on zoom, when `image` is a preview.
  fullUrl: string | null;
  lookYawDeg: number;
  lookPitchDeg: number;
  // Turns to the look direction again when it changes (same panorama).
  lookVersion: number;
  defaultZoom: number;
  markers: PanoramaMarker[];
  // Images to download ahead once the current one is shown.
  preload?: string[];
  // Adds the caller's listeners to the new viewer.
  onCreate?: (viewer: Viewer, markers: MarkersPlugin) => void;
  // The image (kind "full" for the zoom switch) could not be loaded.
  onLoadError?: (panoramaId: string, kind: string, url: string) => void;
}

interface Displayed {
  panoramaId: string;
  url: string;
  kind: string;
}

type Container = HTMLDivElement & { __viewer?: Viewer };

export function usePanoramaViewer(options: PanoramaViewerOptions) {
  const {
    panoramaId,
    image,
    kind,
    fullUrl,
    lookYawDeg,
    lookPitchDeg,
    lookVersion,
    defaultZoom,
    markers,
  } = options;
  const containerRef = useRef<Container>(null);
  const [viewer, setViewer] = useState<{ viewer: Viewer; markers: MarkersPlugin } | null>(null);
  const [shown, setShown] = useState<ShownPanorama | null>(null);
  // No WebGL: PSV cannot run (checked once, in the browser).
  const [broken, setBroken] = useState(() => !webglAvailable());
  const cacheRef = useRef<typeof PsvCache | null>(null);
  const callbacks = useRef(options);
  const initial = useRef({ lookYawDeg, lookPitchDeg, defaultZoom });
  // What the caller wants shown, what is shown, and what is being loaded.
  const want = useRef({
    panoramaId,
    image,
    kind,
    yaw: lookYawDeg * RAD,
    pitch: lookPitchDeg * RAD,
  });
  const displayed = useRef<Displayed | null>(null);
  const loading = useRef<string | null>(null);
  const full = useRef<{ panoramaId: string; url: string } | null>(null);

  useEffect(() => {
    callbacks.current = options;
  });

  // Loads the full resolution of the shown preview when zoomed in far enough.
  const maybeLoadFull = useCallback(() => {
    const v = viewer?.viewer;
    const cache = cacheRef.current;
    const target = full.current;
    const now = displayed.current;
    if (!v || !cache || !target || !now) return;
    if (now.panoramaId !== target.panoramaId || v.getZoomLevel() < FULL_RES_ZOOM) return;
    full.current = null;
    fetchPanorama(target.url, cache)
      .then(() => {
        if (displayed.current?.panoramaId !== target.panoramaId) return false;
        return v.setPanorama(target.url, {
          position: v.getPosition(),
          zoom: v.getZoomLevel(),
          transition: false,
          showLoader: false,
        });
      })
      .then((done) => {
        if (done === false || want.current.panoramaId !== target.panoramaId) return;
        displayed.current = { panoramaId: target.panoramaId, url: target.url, kind: "full" };
        setShown({ id: target.panoramaId, kind: "full" });
      })
      .catch((error) => {
        if (isAbortError(error)) {
          // Superseded (e.g. the next panorama): try again on the next zoom.
          if (want.current.panoramaId === target.panoramaId) full.current ??= target;
          return;
        }
        callbacks.current.onLoadError?.(target.panoramaId, "full", target.url);
      });
  }, [viewer]);
  const maybeLoadFullRef = useRef(maybeLoadFull);
  useEffect(() => {
    maybeLoadFullRef.current = maybeLoadFull;
  }, [maybeLoadFull]);

  // Create the viewer once.
  useEffect(() => {
    let cancelled = false;
    let created: Viewer | null = null;
    const container = containerRef.current;
    if (broken) return;
    loadPhotoSphere()
      .then(([core, markersModule]) => {
        if (cancelled || !container) return;
        cacheRef.current = core.Cache;
        created = new core.Viewer({
          container,
          // Pipeline panoramas are full spheres without GPano XMP: skip reading
          // every image as a string to look for it (megabytes per 4K image).
          adapter: core.EquirectangularAdapter.withConfig({ useXmpData: false }),
          defaultYaw: initial.current.lookYawDeg * RAD,
          defaultPitch: initial.current.lookPitchDeg * RAD,
          defaultZoomLvl: initial.current.defaultZoom,
          navbar: ["zoom", "move", "fullscreen"],
          loadingTxt: "",
          // Arrow keys only while the viewer has the focus (see onFocus).
          keyboard: false,
          // No drift after a drag when the visitor asked for less motion.
          moveInertia: !prefersReducedMotion(),
          lang: t.panorama.lang,
          plugins: [[markersModule.MarkersPlugin, {}]],
        });
        const plugin = created.getPlugin(markersModule.MarkersPlugin) as MarkersPlugin;
        // Test hook: lets browser tests read the view and turn it.
        container.__viewer = created;
        created.addEventListener("zoom-updated", () => maybeLoadFullRef.current());
        labelNavbarButtons(container);
        callbacks.current.onCreate?.(created, plugin);
        setViewer({ viewer: created, markers: plugin });
      })
      .catch(() => {
        if (!cancelled) setBroken(true);
      });
    return () => {
      cancelled = true;
      if (created) {
        destroyViewer(created);
        if (container) delete container.__viewer;
      }
      displayed.current = null;
      loading.current = null;
    };
    // Created once; `broken` only starts false or stays true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The full image of the wanted panorama, unless it is already shown.
  useEffect(() => {
    const already =
      displayed.current?.panoramaId === panoramaId && displayed.current.kind === "full";
    full.current = fullUrl && !already ? { panoramaId, url: fullUrl } : null;
    maybeLoadFull();
  }, [panoramaId, fullUrl, maybeLoadFull]);

  // A new panorama or image: download it, show it, turn to the look direction.
  useEffect(() => {
    want.current = { panoramaId, image, kind, yaw: lookYawDeg * RAD, pitch: lookPitchDeg * RAD };
    const v = viewer?.viewer;
    const cache = cacheRef.current;
    if (!v || !cache || !image) return;
    const now = displayed.current;
    const look = () => ({ yaw: want.current.yaw, pitch: want.current.pitch });
    // Same panorama and kind of image (a re-signed URL of the same file), or
    // its full resolution already shown: just turn.
    if (now?.panoramaId === panoramaId && (now.kind === kind || now.kind === "full")) {
      v.rotate(look());
      return;
    }
    // Already on its way: the load turns to the latest direction when done.
    if (loading.current === image) return;
    loading.current = image;
    const loadKind = kind;
    fetchPanorama(image, cache)
      .then(() => {
        if (want.current.image !== image) return false;
        return v.setPanorama(image, { position: look(), transition: false, showLoader: false });
      })
      .then((done) => {
        if (done === false || want.current.image !== image) return;
        displayed.current = { panoramaId, url: image, kind: loadKind };
        v.rotate(look());
        setShown({ id: panoramaId, kind: loadKind });
        maybeLoadFullRef.current();
      })
      .catch((error) => {
        if (isAbortError(error) || want.current.image !== image) return;
        callbacks.current.onLoadError?.(panoramaId, loadKind, image);
      })
      .finally(() => {
        if (loading.current === image) loading.current = null;
      });
    // lookVersion re-runs this when the caller asks for a direction again.
  }, [viewer, image, kind, panoramaId, lookYawDeg, lookPitchDeg, lookVersion]);

  const loaded = shown?.id === panoramaId;

  // Markers belong to the shown panorama: none while the next one loads.
  useEffect(() => {
    const plugin = viewer?.markers;
    if (!plugin) return;
    if (!loaded) {
      plugin.clearMarkers();
      return;
    }
    plugin.setMarkers(
      markers.map((m) => ({
        id: m.id,
        position: { yaw: m.yawDeg * RAD, pitch: m.pitchDeg * RAD },
        html: m.html,
        anchor: "center center",
        size: { width: m.size, height: m.size },
        ...(m.tooltip ? { tooltip: { content: m.tooltip, position: "top center" } } : {}),
      })),
    );
  }, [viewer, markers, loaded, shown]);

  // Download the likely next images once the current one is on screen.
  const preloadKey = (options.preload ?? []).join("\n");
  useEffect(() => {
    const cache = cacheRef.current;
    if (!viewer || !cache || !loaded || !preloadKey) return;
    prefetchPanoramas(preloadKey.split("\n"), cache);
  }, [viewer, loaded, preloadKey]);

  // Keyboard control while the viewer (or one of its buttons) has the focus,
  // so arrow keys elsewhere keep their meaning (map, guided tour, forms).
  const onFocus = useCallback(() => viewer?.viewer.startKeyboardControl(), [viewer]);
  const onBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      viewer?.viewer.stopKeyboardControl();
    },
    [viewer],
  );

  return { containerRef, shown, loaded, broken, onFocus, onBlur };
}
