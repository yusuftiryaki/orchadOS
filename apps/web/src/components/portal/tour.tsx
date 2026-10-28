"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  neighbourPanoramas,
  normalize180,
  normalize360,
  sameSpot,
  treeMarkers,
  yawInPanorama,
  type TourPanorama,
} from "@/lib/portal/tour";
import { PortalMap } from "./portal-map";
import { TourViewer, type ImageKind, type TourMarker } from "./tour-viewer";
import styles from "./portal.module.css";

// 360° tour of the latest published visit: viewer with arrows to the
// neighbouring panoramas and tree markers, and a map to jump anywhere.

const tt = t.portal.tour;

export interface TourStart {
  panoramaId: string | null;
  // Turn towards this point when the tour opens (e.g. the tree to look at).
  lookAt: Position | null;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export function Tour({ data, start }: { data: TourData; start: TourStart }) {
  const router = useRouter();
  const visits = data.visits;
  // A ?panorama= of an older visit opens that visit.
  const startVisit = Math.max(
    0,
    visits.findIndex((v) => v.panoramas.some((p) => p.id === start.panoramaId)),
  );
  const [visitIndex, setVisitIndex] = useState(startVisit);
  const panoramas = visits[visitIndex]?.panoramas ?? data.panoramas;
  const first =
    panoramas.find((p) => p.id === start.panoramaId) ??
    (start.lookAt ? nearestPanorama(panoramas, start.lookAt) : null) ??
    panoramas[0];
  const [current, setCurrent] = useState<TourPanorama>(first);
  const [look, setLook] = useState({
    yaw: start.lookAt ? yawInPanorama(first, start.lookAt) : 0,
    version: 0,
  });
  // Where the viewer looks now (yaw from the centre column), for the map
  // wedge and for time travel.
  const [viewYaw, setViewYaw] = useState(look.yaw);
  const [farNote, setFarNote] = useState<string | null>(null);
  // asset id -> signed URL (null: missing or refused). Absent: not asked yet.
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());
  // A demo session reached its image cap (docs/demo-turu.md §5.3).
  const [capped, setCapped] = useState(false);

  const wanted = useMemo(
    () => [current.previewAssetId, current.fullAssetId].filter((id): id is string => Boolean(id)),
    [current],
  );
  useEffect(() => {
    const missing = wanted.filter((id) => !(id in urls));
    if (missing.length === 0) return;
    let cancelled = false;
    signTourImagesAction(data.parcel.id, missing)
      .catch(() => ({ urls: Object.fromEntries(missing.map((id) => [id, null])), capped: false }))
      .then((signed) => {
        if (cancelled) return;
        setUrls((u) => ({ ...u, ...signed.urls }));
        if (signed.capped) setCapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, urls, data.parcel.id]);

  const signedReady = wanted.every((id) => id in urls);
  const previewUrl = current.previewAssetId ? urls[current.previewAssetId] : null;
  const fullUrl = current.fullAssetId ? urls[current.fullAssetId] : null;
  let image: string;
  let kind: ImageKind;
  if (signedReady && !failed.has(current.id) && (previewUrl || fullUrl)) {
    image = (previewUrl ?? fullUrl)!;
    kind = previewUrl ? "preview" : "full";
  } else {
    image = placeholderPanorama(current.headingDeg);
    kind = "placeholder";
  }

  const neighbours = useMemo(() => neighbourPanoramas(panoramas, current), [panoramas, current]);
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
      tooltip: `${tt.treeMarker(m.tree.code)} · ${t.portal.classes[m.tree.state]}`,
      size: 28,
    }));
    return [...arrows, ...trees];
  }, [neighbours, data.trees, current]);

  const goTo = useCallback((next: TourPanorama, yaw: number) => {
    setCurrent(next);
    setLook((l) => ({ yaw, version: l.version + 1 }));
    setViewYaw(yaw);
    setFarNote(null);
  }, []);

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

  const onMarker = useCallback(
    (id: string) => {
      const [type, key] = id.split(":");
      if (type === "pano") {
        const n = neighbours.find((x) => x.panorama.id === key);
        // Keep looking the way we were walking.
        if (n) goTo(n.panorama, normalize180(n.azimuthDeg - n.panorama.headingDeg));
      } else if (type === "tree") {
        router.push(`/portal/parsel/${data.parcel.id}/agac/${key}`);
      }
    },
    [neighbours, goTo, router, data.parcel.id],
  );

  const onMapClick = useCallback(
    (point: Position) => {
      const next = nearestPanorama(panoramas, point);
      if (!next) return;
      goTo(next, distanceM(next.position, point) > 1 ? yawInPanorama(next, point) : 0);
    },
    [panoramas, goTo],
  );

  const onLoadError = useCallback((id: string) => {
    setFailed((f) => new Set(f).add(id));
  }, []);

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
        <div className={styles.viewerWrap}>
          <TourViewer
            panoramaId={current.id}
            image={image}
            imageKind={kind}
            fullUrl={kind === "preview" ? (fullUrl ?? null) : null}
            lookYawDeg={look.yaw}
            lookVersion={look.version}
            markers={markers}
            onMarker={onMarker}
            onLoadError={onLoadError}
            onViewChange={setViewYaw}
            label={tt.viewer}
          />
          {kind === "placeholder" && signedReady && (
            <p className={styles.viewerNote} data-testid="tour-placeholder">
              {tt.placeholderNote}
            </p>
          )}
        </div>
        <div className={styles.mapColumn}>
          <PortalMap
            className={styles.tourMap}
            boundary={data.boundary}
            slots={mapSlots}
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

const placeholderCache = new Map<number, string>();

// Equirectangular stand-in when the image is missing: sky, ground, horizon and
// compass letters at their true directions, so arrows and tree markers still
// make sense.
function placeholderPanorama(headingDeg: number): string {
  const key = Math.round(headingDeg);
  const cached = placeholderCache.get(key);
  if (cached) return cached;
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const sky = ctx.createLinearGradient(0, 0, 0, height / 2);
  sky.addColorStop(0, "#74c0fc");
  sky.addColorStop(1, "#e7f5ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height / 2);
  const ground = ctx.createLinearGradient(0, height / 2, 0, height);
  ground.addColorStop(0, "#d8c8a8");
  ground.addColorStop(1, "#8c7a55");
  ctx.fillStyle = ground;
  ctx.fillRect(0, height / 2, width, height / 2);
  ctx.fillStyle = "#495057";
  ctx.fillRect(0, height / 2 - 1, width, 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const column = (azimuth: number) => (0.5 + normalize180(azimuth - headingDeg) / 360) * width;
  ctx.font = "bold 56px system-ui, sans-serif";
  for (const [label, azimuth] of [
    ["K", 0],
    ["D", 90],
    ["G", 180],
    ["B", 270],
  ] as const) {
    ctx.fillStyle = "#212529";
    ctx.fillText(label, column(azimuth), height / 2 - 60);
  }
  ctx.font = "32px system-ui, sans-serif";
  ctx.fillStyle = "#495057";
  for (let i = 0; i < 4; i += 1) {
    ctx.fillText(tt.placeholder, (i + 0.5) * (width / 4), height / 2 + 80);
  }
  const url = canvas.toDataURL("image/png");
  placeholderCache.set(key, url);
  return url;
}
