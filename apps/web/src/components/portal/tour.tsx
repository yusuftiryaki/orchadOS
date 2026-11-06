"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signTourImagesAction } from "@/app/portal/parsel/[parcelId]/gezi/actions";
import { DemoNotice } from "@/components/demo/demo-notice";
import { formatDate, formatMeasure, t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import type { Position } from "@/lib/map/geo";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import { adjacentTree } from "@/lib/panorama/zoom";
import {
  crownGuide,
  crownGuideMarkers,
  DEFAULT_CAMERA_HEIGHT_M,
  panoramaGuide,
} from "@/lib/portal/crown-guide";
import type { TourData } from "@/lib/portal/data";
import {
  distanceM,
  nearestPanorama,
  normalize180,
  normalize360,
  sameSpot,
  treeMarkers,
  yawInPanorama,
  type Neighbour,
  type TourPanorama,
} from "@/lib/portal/tour";
import type { SignedTourImages } from "@/lib/portal/tour-sign";
import {
  addSigned,
  assetOfKind,
  chooseImage,
  compassPoint,
  dropStale,
  escapeHtml,
  idsToSign,
  preloadUrls,
  tourNeighbours,
  tourSearch,
  tourStart,
  type ImageKind,
  type SignedImages,
} from "@/lib/portal/tour-view";
import { PortalMap } from "./portal-map";
import { placeholderPanorama } from "./tour-placeholder";
import { TourTreePanel } from "./tour-tree-panel";
import {
  TOUR_DEFAULT_ZOOM,
  TourViewer,
  type TourFocus,
  type TourMarker,
  type TourView,
} from "./tour-viewer";
import type { WorldStartView, WorldTree } from "./world-view";
import styles from "./portal.module.css";
import worldStyles from "./world.module.css";

// The 3D world (three.js scene, cloud reader) loads only when opened.
const WorldView = dynamic(() => import("./world-view"), { ssr: false });

// 360° tour of the latest published visit: viewer with arrows to the
// neighbouring panoramas and tree markers, and a map to jump anywhere. The
// panorama on screen is kept in the address (?panorama=), so a reload, a
// shared link or the browser's Back from a tree card comes back to it.
//
// A tree marker focuses the tree: the viewer turns to it and zooms in, and a
// panel over the photo shows its class, the trees beside it and its tree
// card. Walking to another panorama returns to the overview zoom; time
// travel keeps the zoom and the focused tree, to compare the same tree.
// When the visit on screen measured the focused tree's crown (LiDAR), the
// panel lists the values and the panorama shows them drawn on the tree.
// When it has a 3D world cloud, a button turns the panorama into the 3D
// world (world-view.tsx) and back.

const tt = t.portal.tour;
// PortalMap rebuilds the whole map when `findings` changes identity, and its
// default ([]) is a new array on every render: the tour passes a stable one.
const NO_FINDINGS: [] = [];

export interface TourStart {
  panoramaId: string | null;
  // Turn towards this point when the tour opens (e.g. the tree to look at).
  lookAt: Position | null;
}

export function Tour({
  data,
  start,
  images,
}: {
  data: TourData;
  start: TourStart;
  // The first panorama's images, signed by the page.
  images: SignedTourImages | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const visits = data.visits;
  // The address wins over the page's props: Back restores the page as first
  // rendered, but with the address the tour last wrote.
  const [startPoint] = useState(
    () =>
      tourStart(visits, { ...start, panoramaId: search.get("panorama") ?? start.panoramaId }) ??
      tourStart([{ panoramas: data.panoramas }], start)!,
  );
  const [visitIndex, setVisitIndex] = useState(startPoint.visitIndex);
  const panoramas = visits[visitIndex]?.panoramas ?? data.panoramas;
  const [current, setCurrent] = useState<TourPanorama>(startPoint.panorama);
  const [look, setLook] = useState<{ yaw: number; zoom: number | null; version: number }>({
    yaw: startPoint.lookYawDeg,
    zoom: null,
    version: 0,
  });
  // The focused tree (its id), and the request counter for the viewer.
  const [focus, setFocus] = useState<{ treeId: string | null; version: number }>({
    treeId: null,
    version: 0,
  });
  // Where the viewer looks now (yaw from the centre column), for the map
  // wedge, time travel and preloading.
  const [viewYaw, setViewYaw] = useState(look.yaw);
  const [farNote, setFarNote] = useState<string | null>(null);
  // Set once the visitor moves: from then on the address follows the tour.
  const [moved, setMoved] = useState(false);
  const [signed, setSigned] = useState<SignedImages>(() =>
    images ? addSigned({}, images.urls, performance.timeOrigin + performance.now()) : {},
  );
  // URLs that failed to load twice (each asset is signed once more first).
  const [bad, setBad] = useState<ReadonlySet<string>>(new Set());
  const retried = useRef(new Set<string>());
  const requested = useRef(new Set<string>());
  // A demo session reached its image cap (docs/demo-turu.md §5.3).
  const [capped, setCapped] = useState(images?.capped ?? false);
  // The open 3D world: the visit's cloud and the view it starts from.
  const [world, setWorld] = useState<{ assetId: string; start: WorldStartView } | null>(null);
  const viewRef = useRef<(() => TourView | null) | null>(null);

  const neighbours = useMemo(() => tourNeighbours(panoramas, current), [panoramas, current]);

  // Sign what the current panorama and its neighbours need (URLs about to
  // expire included), one request at a time per id.
  useEffect(() => {
    const around = [current, ...neighbours.map((n) => n.panorama)];
    const ids = around.flatMap((p) => [p.previewAssetId, p.fullAssetId]).filter(Boolean);
    const fresh = dropStale(signed, ids as string[], Date.now());
    const missing = idsToSign(
      current,
      neighbours.map((n) => n.panorama),
      fresh,
    ).filter((id) => !requested.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) requested.current.add(id);
    signTourImagesAction(data.parcel.id, missing)
      .catch(() => ({ urls: Object.fromEntries(missing.map((id) => [id, null])), capped: false }))
      .then((result) => {
        for (const id of missing) requested.current.delete(id);
        setSigned((s) => addSigned(s, result.urls, Date.now()));
        if (result.capped) setCapped(true);
      });
  }, [current, neighbours, signed, data.parcel.id]);

  const choice = chooseImage(current, signed, bad);
  let image: string | null;
  let kind: ImageKind;
  let fullUrl: string | null = null;
  if (choice.status === "ready") {
    image = choice.url;
    kind = choice.kind;
    fullUrl = choice.fullUrl;
  } else if (choice.status === "missing") {
    image = placeholderPanorama(current.headingDeg);
    kind = "placeholder";
  } else {
    image = null;
    kind = "preview";
  }

  // Trees around the current panorama, nearest first.
  const trees = useMemo(
    () => treeMarkers(data.trees, current, { maxDistanceM: 14, limit: 24 }),
    [data.trees, current],
  );
  const focused = trees.find((m) => m.tree.id === focus.treeId) ?? null;
  // The focused tree's crown values in the visit on screen (time travel
  // switches to that visit's values, or none).
  const tourVisit = visits[visitIndex] ?? null;
  const crown = (focused && tourVisit?.crowns[focused.tree.id]) || null;
  const worldAssetId = tourVisit?.worldAssetId ?? null;
  const worldTrees = useMemo<WorldTree[]>(
    () =>
      data.trees.map((tr) => ({
        id: tr.id,
        code: tr.code,
        position: tr.position,
        state: tr.state,
        crown: tourVisit?.crowns[tr.id] ?? null,
      })),
    [data.trees, tourVisit],
  );
  const crownMarkers = useMemo<TourMarker[]>(() => {
    const guide = crownGuide(crown);
    if (!guide || !focused) return [];
    const drawn = panoramaGuide(
      guide,
      current,
      focused.tree.position,
      tourVisit?.cameraHeightM ?? DEFAULT_CAMERA_HEIGHT_M,
    );
    if (!drawn) return [];
    return crownGuideMarkers(drawn, {
      heightText: t.portal.tree.guide.height(formatMeasure(guide.topM, "m")),
      widthText: t.portal.tree.guide.width(formatMeasure(guide.widthM, "m")),
      inertClass: styles.crownInert,
      labelClass: styles.crownLabel,
    });
  }, [crown, focused, current, tourVisit]);

  const markers = useMemo<TourMarker[]>(() => {
    const arrows = neighbours.map((n) => ({
      id: `pano:${n.panorama.id}`,
      yawDeg: n.yawDeg,
      pitchDeg: -28,
      html: `<div class="${styles.arrowMarker}" data-arrow="${n.panorama.id}">▲</div>`,
      tooltip: `${tt.arrow} (${Math.round(n.distanceM)} m)`,
      size: 44,
    }));
    const treeIcons = trees.map((m) => {
      const isFocused = m.tree.id === focus.treeId;
      return {
        id: `tree:${m.tree.id}`,
        yawDeg: m.yawDeg,
        pitchDeg: m.pitchDeg,
        html: `<div class="${styles.treeMarker}" data-tree="${escapeHtml(m.tree.code)}"${isFocused ? ' data-focused="true"' : ""}><span class="${styles.treeDot}" data-class="${m.tree.state}" style="background:${MARKER_COLORS[m.tree.state]}"></span>${escapeHtml(m.tree.code)}</div>`,
        tooltip: escapeHtml(
          `${isFocused ? tt.treeMarkerCard(m.tree.code) : tt.treeMarker(m.tree.code)} (${t.portal.classes[m.tree.state]})`,
        ),
        size: 28,
      };
    });
    // The crown drawing under the markers, so they stay clickable.
    return [...crownMarkers, ...arrows, ...treeIcons];
  }, [neighbours, trees, focus.treeId, crownMarkers]);

  // Preload towards where the visitor looks (in 45° steps, not every frame).
  const viewSector = Math.round(viewYaw / 45) * 45;
  const preload = useMemo(
    () => preloadUrls(neighbours, viewSector, signed),
    [neighbours, viewSector, signed],
  );

  // Opens `next` looking at `yaw`. Walking returns to the overview zoom and
  // drops the tree focus; time travel keeps both (the same tree, another year).
  const goTo = useCallback(
    (next: TourPanorama, yaw: number, { keepView = false }: { keepView?: boolean } = {}) => {
      setCurrent(next);
      setLook((l) => ({ yaw, zoom: keepView ? null : TOUR_DEFAULT_ZOOM, version: l.version + 1 }));
      setViewYaw(yaw);
      setFarNote(null);
      setMoved(true);
      // No version bump: the viewer is already turning to the new look.
      if (!keepView) setFocus((f) => ({ treeId: null, version: f.version }));
    },
    [],
  );

  const treeHref = useCallback(
    (treeId: string) => `/portal/parsel/${data.parcel.id}/agac/${treeId}`,
    [data.parcel.id],
  );

  const focusTree = useCallback((treeId: string | null) => {
    setFocus((f) => ({ treeId, version: f.version + 1 }));
  }, []);

  // The address follows the tour once the visitor moves (not on opening, so
  // the guided demo tour keeps its own address).
  useEffect(() => {
    if (!moved) return;
    const next = tourSearch(window.location.search, current.id);
    if (next === window.location.search) return;
    window.history.replaceState(null, "", `${window.location.pathname}${next}`);
  }, [moved, current.id]);

  // Time travel: the same spot in another visit, looking the same way.
  const changeVisit = useCallback(
    (index: number) => {
      const target = visits[index];
      if (!target) return;
      setVisitIndex(index);
      const same = sameSpot(target.panoramas, current, viewYaw);
      if (same) {
        goTo(same.panorama, same.yawDeg, { keepView: true });
        return;
      }
      const near = nearestPanorama(target.panoramas, current.position) ?? target.panoramas[0];
      goTo(near, normalize180(current.headingDeg + viewYaw - near.headingDeg), { keepView: true });
      setFarNote(tt.noSameSpot(formatDate(target.visit.time)));
    },
    [visits, current, viewYaw, goTo],
  );

  // Keep looking the way we were walking.
  const walk = useCallback(
    (n: Neighbour<TourPanorama>) =>
      goTo(n.panorama, normalize180(n.azimuthDeg - n.panorama.headingDeg)),
    [goTo],
  );

  const onMarker = useCallback(
    (id: string) => {
      const [type, key] = id.split(":");
      if (type === "pano") {
        const n = neighbours.find((x) => x.panorama.id === key);
        if (n) walk(n);
      } else if (type === "tree") {
        // First tap zooms on the tree; a tap on the focused tree opens its card.
        if (key === focus.treeId) router.push(treeHref(key));
        else focusTree(key);
      }
    },
    [neighbours, walk, router, treeHref, focus.treeId, focusTree],
  );

  const stepTree = useCallback(
    (dir: 1 | -1) => {
      const next = adjacentTree(
        trees.map((m) => ({ id: m.tree.id, yawDeg: m.yawDeg })),
        focus.treeId,
        dir,
      );
      if (next) focusTree(next.id);
    },
    [trees, focus.treeId, focusTree],
  );

  // Opens the 3D world from the view on screen: the transition starts at
  // the panorama's exact yaw, pitch and zoom, over the image shown.
  const openWorld = useCallback(() => {
    if (!worldAssetId) return;
    const v = viewRef.current?.();
    if (!v) return;
    setWorld({
      assetId: worldAssetId,
      start: {
        position: current.position,
        headingDeg: current.headingDeg,
        yawDeg: v.yawDeg,
        pitchDeg: v.pitchDeg,
        fovDeg: v.fovDeg,
        photoUrl: v.kind === "full" && fullUrl ? fullUrl : image,
      },
    });
  }, [worldAssetId, current, fullUrl, image]);

  // The viewer acts on a new version only (see TourViewer).
  const viewerFocus: TourFocus = {
    target: focused
      ? { yawDeg: focused.yawDeg, pitchDeg: focused.pitchDeg, distanceM: focused.distanceM }
      : null,
    version: focus.version,
  };

  const onMapClick = useCallback(
    (point: Position) => {
      const next = nearestPanorama(panoramas, point);
      if (!next) return;
      goTo(next, distanceM(next.position, point) > 1 ? yawInPanorama(next, point) : 0);
    },
    [panoramas, goTo],
  );

  // A failed image: sign its asset once more and load it again (an expired
  // link, a dropped connection); a second failure falls back (preview → full
  // image → placeholder).
  const onLoadError = useCallback(
    (panoramaId: string, failedKind: ImageKind, url: string) => {
      const panorama = visits.flatMap((v) => v.panoramas).find((p) => p.id === panoramaId);
      const assetId = panorama ? assetOfKind(panorama, failedKind) : null;
      if (!assetId || retried.current.has(assetId)) {
        setBad((b) => new Set(b).add(url));
        return;
      }
      retried.current.add(assetId);
      setSigned((s) => {
        const next = { ...s };
        delete next[assetId];
        return next;
      });
    },
    [visits],
  );

  const mapSlots = useMemo(
    () =>
      data.trees.map((tr) => ({
        slotId: tr.id,
        code: tr.code,
        state: tr.state,
        position: tr.position,
      })),
    [data.trees],
  );
  const mapPanoramas = useMemo(
    () => panoramas.map((p) => ({ id: p.id, position: p.position })),
    [panoramas],
  );
  const view = useMemo(
    () => ({ position: current.position, azimuthDeg: normalize360(current.headingDeg + viewYaw) }),
    [current, viewYaw],
  );
  const visit = visits[visitIndex]?.visit ?? data.visit;

  return (
    <>
      {capped && <DemoNotice text={demoText.closed.images} />}
      <div className={styles.tour}>
        <div className={styles.viewerColumn}>
          <div className={styles.viewerWrap}>
            <TourViewer
              panoramaId={current.id}
              image={image}
              imageKind={kind}
              fullUrl={fullUrl}
              lookYawDeg={look.yaw}
              lookZoom={look.zoom}
              lookVersion={look.version}
              focus={viewerFocus}
              markers={markers}
              preload={preload}
              onMarker={onMarker}
              onLoadError={onLoadError}
              onViewChange={setViewYaw}
              onEscape={focused ? () => focusTree(null) : undefined}
              label={tt.viewer}
              interactive={!world}
              viewRef={viewRef}
            >
              {world ? (
                <WorldView
                  key={world.assetId}
                  parcelId={data.parcel.id}
                  assetId={world.assetId}
                  start={world.start}
                  cameraHeightM={tourVisit?.cameraHeightM ?? DEFAULT_CAMERA_HEIGHT_M}
                  trees={worldTrees}
                  treeHref={treeHref}
                  onExit={() => setWorld(null)}
                />
              ) : (
                <>
                  {focused && (
                    <TourTreePanel
                      tree={focused.tree}
                      distanceM={focused.distanceM}
                      crown={crown}
                      href={treeHref(focused.tree.id)}
                      canStep={trees.length > 1}
                      onStep={stepTree}
                      onClose={() => focusTree(null)}
                    />
                  )}
                  {worldAssetId && (
                    <button
                      type="button"
                      className={worldStyles.enter}
                      onClick={openWorld}
                      title={tt.world.enterHint}
                      data-testid="world-enter"
                    >
                      <span aria-hidden="true">◈</span> {tt.world.enter}
                    </button>
                  )}
                </>
              )}
            </TourViewer>
            {kind === "placeholder" && (
              <p className={styles.viewerNote} data-testid="tour-placeholder">
                {tt.placeholderNote}
              </p>
            )}
          </div>
          <p className={`muted ${styles.small}`} data-testid="tour-zoom-hint">
            {tt.zoomHint}
          </p>
          {neighbours.length > 0 && (
            <nav className={styles.tourSteps} aria-label={tt.steps} data-testid="tour-steps">
              {neighbours.map((n) => (
                <button
                  key={n.panorama.id}
                  type="button"
                  className={styles.stepButton}
                  data-target={n.panorama.id}
                  onClick={() => walk(n)}
                >
                  <span
                    aria-hidden="true"
                    className={styles.stepArrow}
                    style={{ transform: `rotate(${Math.round(n.azimuthDeg)}deg)` }}
                  >
                    ↑
                  </span>
                  {tt.step(tt.compass[compassPoint(n.azimuthDeg)], Math.round(n.distanceM))}
                </button>
              ))}
            </nav>
          )}
        </div>
        <div className={styles.mapColumn}>
          <PortalMap
            className={styles.tourMap}
            boundary={data.boundary}
            slots={mapSlots}
            findings={NO_FINDINGS}
            panoramas={mapPanoramas}
            bounds={data.bounds}
            currentPanoramaId={current.id}
            focus={current.position}
            onPointClick={onMapClick}
            label={tt.mapHint}
            view={view}
          />
          {visits.length > 1 && (
            <label className={styles.small}>
              {tt.timeTravel}{" "}
              <select
                value={visitIndex}
                onChange={(e) => changeVisit(Number(e.target.value))}
                data-testid="tour-visit"
              >
                {visits.map((v, i) => (
                  <option key={v.visit.id} value={i}>
                    {formatDate(v.visit.time)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {farNote && (
            <p className={`muted ${styles.small}`} data-testid="tour-far">
              {farNote}
            </p>
          )}
          <p className={`muted ${styles.small}`}>
            {tt.mapHint} {tt.viewDirection}{" "}
            {visit && `${tt.visit(formatDate(visit.time))}, ${tt.count(panoramas.length)}.`}
          </p>
        </div>
      </div>
    </>
  );
}
