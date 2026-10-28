"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signTourImagesAction } from "@/app/portal/parsel/[parcelId]/gezi/actions";
import { DemoNotice } from "@/components/demo/demo-notice";
import { formatDate, t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import type { Position } from "@/lib/map/geo";
import { MARKER_COLORS } from "@/lib/map/tree-style";
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
import { TourViewer, type TourMarker } from "./tour-viewer";
import styles from "./portal.module.css";

// 360° tour of the latest published visit: viewer with arrows to the
// neighbouring panoramas and tree markers, and a map to jump anywhere. The
// panorama on screen is kept in the address (?panorama=), so a reload, a
// shared link or the browser's Back from a tree card comes back to it.

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
  const [look, setLook] = useState({ yaw: startPoint.lookYawDeg, version: 0 });
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

  const markers = useMemo<TourMarker[]>(() => {
    const arrows = neighbours.map((n) => ({
      id: `pano:${n.panorama.id}`,
      yawDeg: n.yawDeg,
      pitchDeg: -28,
      html: `<div class="${styles.arrowMarker}" data-arrow="${n.panorama.id}">▲</div>`,
      tooltip: `${tt.arrow} (${Math.round(n.distanceM)} m)`,
      size: 44,
    }));
    const trees = treeMarkers(data.trees, current, { maxDistanceM: 14, limit: 24 }).map((m) => ({
      id: `tree:${m.tree.id}`,
      yawDeg: m.yawDeg,
      pitchDeg: m.pitchDeg,
      html: `<div class="${styles.treeMarker}" data-tree="${escapeHtml(m.tree.code)}"><span class="${styles.treeDot}" style="background:${MARKER_COLORS[m.tree.state]}"></span>${escapeHtml(m.tree.code)}</div>`,
      tooltip: escapeHtml(`${tt.treeMarker(m.tree.code)} · ${t.portal.classes[m.tree.state]}`),
      size: 28,
    }));
    return [...arrows, ...trees];
  }, [neighbours, data.trees, current]);

  // Preload towards where the visitor looks (in 45° steps, not every frame).
  const viewSector = Math.round(viewYaw / 45) * 45;
  const preload = useMemo(
    () => preloadUrls(neighbours, viewSector, signed),
    [neighbours, viewSector, signed],
  );

  const goTo = useCallback((next: TourPanorama, yaw: number) => {
    setCurrent(next);
    setLook((l) => ({ yaw, version: l.version + 1 }));
    setViewYaw(yaw);
    setFarNote(null);
    setMoved(true);
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
        goTo(same.panorama, same.yawDeg);
        return;
      }
      const near = nearestPanorama(target.panoramas, current.position) ?? target.panoramas[0];
      goTo(near, normalize180(current.headingDeg + viewYaw - near.headingDeg));
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
        router.push(`/portal/parsel/${data.parcel.id}/agac/${key}`);
      }
    },
    [neighbours, walk, router, data.parcel.id],
  );

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
              lookVersion={look.version}
              markers={markers}
              preload={preload}
              onMarker={onMarker}
              onLoadError={onLoadError}
              onViewChange={setViewYaw}
              label={tt.viewer}
            />
            {kind === "placeholder" && (
              <p className={styles.viewerNote} data-testid="tour-placeholder">
                {tt.placeholderNote}
              </p>
            )}
          </div>
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
            {visit && `${tt.visit(formatDate(visit.time))} · ${tt.count(panoramas.length)}`}
          </p>
        </div>
      </div>
    </>
  );
}
