"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signTourWorldAction } from "@/app/portal/parsel/[parcelId]/gezi/actions";
import { formatMeasure, t } from "@/lib/i18n";
import type { Position } from "@/lib/map/geo";
import { prefersReducedMotion } from "@/lib/map/motion";
import type { MarkerState } from "@/lib/map/tree-style";
import { crownGuide, type CrownMeasure, type CrownValues } from "@/lib/portal/crown-guide";
import type { WorldCloud } from "@/lib/world/format";
import { changeSpan, localFrame, toEN, type LocalFrame } from "@/lib/world/geometry";
import { loadWorldCloud } from "@/lib/world/stream";
import { winterSummary, type TreeWinter, type WinterSummary } from "@/lib/world/skeleton";
import { growthOf, worldVisits, type Growth, type WorldVisit } from "@/lib/world/visits";
import { WorldScene, type ColorMode, type SceneTree, type SceneVisit } from "./world-scene";
import styles from "./world.module.css";

// The 3D world over the tour viewer (docs/3d-dunya.md): signs and downloads
// the visit's world cloud (a coarse quarter first, then the rest), hands it
// to WorldScene, which starts at the panorama's exact view and turns the
// photo into the cloud. The overlay holds the way back, the visit (another
// visit's cloud dissolves in), the colour modes (growth since the previous
// measurement included), the selected tree's measurements and the labels.
//
// Loaded on demand (tour.tsx imports it dynamically), so three.js's extra
// code reaches only those who open the world.

const tw = t.portal.tour.world;
const tt = t.portal.tour;

export interface WorldTree {
  id: string;
  code: string;
  position: Position;
  state: MarkerState;
}

export type { WorldVisit };

export interface WorldStartView {
  // Panorama the visitor stands in, and how they look (yaw from its centre
  // column, pitch, vertical field of view).
  position: Position;
  headingDeg: number;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
  // The image on screen, drawn as the first frame of the transition.
  photoUrl: string | null;
}

type Status = "loading" | "error" | "capped" | "entering" | "world" | "exiting";

export default function WorldView({
  parcelId,
  visits,
  visitId,
  start,
  cameraHeightM,
  trees,
  treeHref,
  onExit,
}: {
  parcelId: string;
  // Every visit with crown values or a cloud, newest first.
  visits: WorldVisit[];
  // The visit of the panorama on screen (it has a cloud).
  visitId: string;
  start: WorldStartView;
  cameraHeightM: number;
  trees: WorldTree[];
  treeHref: (treeId: string) => string;
  onExit: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const frameRef = useRef<LocalFrame | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<ColorMode>("photo");
  const [selected, setSelected] = useState<string | null>(null);
  // The visit on screen and the one whose cloud is on its way.
  const [shown, setShown] = useState(visitId);
  const [pending, setPending] = useState<string | null>(null);
  // Winter scans: their skeleton and cuts (known once the whole cloud is in).
  const [winter, setWinter] = useState<Record<string, WinterSummary>>({});
  const [skeletonOn, setSkeletonOn] = useState(true);
  // The opening view, data and callbacks are read once, when the scene is built.
  const startRef = useRef({ start, cameraHeightM, trees, visits, onExit });
  useEffect(() => {
    startRef.current.onExit = onExit;
  });

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // A visit's cloud: signed, downloaded coarse then whole, given to the scene.
  const loadVisit = useCallback(
    async (id: string, signal: AbortSignal, onCloud: (cloud: WorldCloud) => void) => {
      const visit = startRef.current.visits.find((v) => v.id === id);
      if (!visit?.assetId) throw new Error("no cloud");
      const signed = await signTourWorldAction(parcelId, visit.assetId);
      if (signal.aborted) return;
      if (!signed.url) {
        throw new SignError(signed.capped);
      }
      const whole = await loadWorldCloud(signed.url, {
        signal,
        onCoarse: (c) => !signal.aborted && onCloud(c),
      });
      if (signal.aborted) return;
      onCloud(whole);
      const summary = winterSummary(whole);
      if (summary) setWinter((w) => ({ ...w, [id]: summary }));
    },
    [parcelId],
  );

  const sceneVisit = useCallback((id: string, cloud: WorldCloud): SceneVisit => {
    const { trees: list, visits: all } = startRef.current;
    return { key: id, cloud, trees: sceneTrees(frameRef.current!, list, all, id) };
  }, []);

  // The panorama's visit: the scene is built on its first (coarse) cloud.
  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    loadVisit(visitId, abort.signal, (cloud) => {
      const scene = sceneRef.current;
      if (scene) {
        scene.setVisit(sceneVisit(visitId, cloud));
        return;
      }
      if (!stageRef.current || !labelsRef.current) return;
      const { start: view, cameraHeightM: height } = startRef.current;
      const frame = localFrame(cloud.header.origin_lat, cloud.header.origin_lon);
      frameRef.current = frame;
      sceneRef.current = new WorldScene({
        container: stageRef.current,
        labels: labelsRef.current,
        visit: sceneVisit(visitId, cloud),
        frame,
        photoUrl: view.photoUrl,
        eyeEN: toEN(frame, view.position),
        headingDeg: view.headingDeg,
        yawDeg: view.yawDeg,
        pitchDeg: view.pitchDeg,
        fovDeg: view.fovDeg,
        cameraHeightM: height,
        reducedMotion: prefersReducedMotion(),
        labelText,
        onSelect: setSelected,
        onEntered: () => setStatus("world"),
      });
      setStatus("entering");
    }).catch((error) => {
      if (abort.signal.aborted) return;
      setStatus(error instanceof SignError && error.capped ? "capped" : "error");
    });
    return () => {
      abort.abort();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [visitId, loadVisit, sceneVisit]);

  // Another visit: its cloud dissolves in (downloaded the first time).
  const changeVisit = useCallback(
    (id: string) => {
      const scene = sceneRef.current;
      if (!scene || id === shown) return;
      setShown(id);
      if (scene.hasVisit(id)) {
        scene.showVisit(id);
        return;
      }
      setPending(id);
      const signal = abortRef.current!.signal;
      let first = true;
      loadVisit(id, signal, (cloud) => {
        scene.setVisit(sceneVisit(id, cloud));
        if (first) {
          first = false;
          scene.showVisit(id);
        }
      })
        .then(() => setPending((p) => (p === id ? null : p)))
        .catch(() => {
          if (signal.aborted) return;
          setPending(null);
          setShown(scene.visitKey);
        });
    },
    [shown, loadVisit, sceneVisit],
  );

  useEffect(() => {
    sceneRef.current?.select(selected);
  }, [selected, status]);

  const exit = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || status === "loading" || status === "error" || status === "capped") {
      startRef.current.onExit();
      return;
    }
    setSelected(null);
    setStatus("exiting");
    scene.exit(() => startRef.current.onExit());
  }, [status]);

  const shownVisit = visits.find((v) => v.id === shown) ?? null;
  const shownWinter = winter[shown] ?? null;
  const choices = useMemo(() => worldVisits(visits), [visits]);
  const growth = useMemo(
    () =>
      new Map(
        trees.flatMap((x) => {
          const g = growthOf(visits, shown, x.id);
          return g ? [[x.id, g] as [string, Growth]] : [];
        }),
      ),
    [trees, visits, shown],
  );
  const modes = (Object.keys(tw.modes) as ColorMode[]).filter(
    (m) => m !== "growth" || growth.size > 0,
  );
  // Growth mode on a visit without growth shows the photo colours.
  const shownMode: ColorMode = mode === "growth" && growth.size === 0 ? "photo" : mode;

  useEffect(() => {
    sceneRef.current?.setColorMode(shownMode);
  }, [shownMode, status]);

  useEffect(() => {
    sceneRef.current?.setSkeleton(skeletonOn);
  }, [skeletonOn, status, winter]);

  const tree = useMemo(() => trees.find((x) => x.id === selected) ?? null, [trees, selected]);
  const legend = useMemo(() => {
    if (shownMode === "photo" || !shownVisit) return null;
    if (shownMode === "growth") {
      const span = changeSpan([...growth.values()].map((g) => g.deltaM));
      return { text: tw.growthLegend(formatMeasure(span, "m", null, 2)), diverging: true };
    }
    const values = Object.values(shownVisit.crowns)
      .map((c) => (shownMode === "height" ? c.heightM : c.diameterM)?.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return null;
    return {
      text: tw.legend(
        formatMeasure(Math.min(...values), "m"),
        formatMeasure(Math.max(...values), "m"),
      ),
      diverging: false,
    };
  }, [shownMode, shownVisit, growth]);

  const busy = status === "loading" || status === "entering" || status === "exiting";

  return (
    <div
      ref={rootRef}
      className={styles.world}
      role="region"
      aria-label={tw.region}
      aria-busy={busy || pending !== null}
      tabIndex={-1}
      data-testid="world"
      data-status={status}
      data-visit={shown}
      data-pending={pending ?? ""}
      data-winter={shownWinter ? "true" : "false"}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // The tour's own Escape (tree focus) must not see it.
        event.stopPropagation();
        if (selected) setSelected(null);
        else exit();
      }}
    >
      <div ref={stageRef} className={styles.stage} />
      <div ref={labelsRef} className={styles.labels} data-testid="world-labels" />
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.button}
          onClick={exit}
          disabled={status === "exiting"}
          data-testid="world-back"
        >
          <span aria-hidden="true">←</span> {tw.back}
        </button>
        {status === "world" && choices.length > 1 && (
          <label className={styles.mode}>
            {tw.visit}
            <select
              value={shown}
              onChange={(e) => changeVisit(e.target.value)}
              data-testid="world-visit"
            >
              {choices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {status === "world" && (
          <label className={styles.mode}>
            {tw.colorMode}
            <select
              value={shownMode}
              onChange={(e) => setMode(e.target.value as ColorMode)}
              data-testid="world-mode"
            >
              {modes.map((m) => (
                <option key={m} value={m}>
                  {tw.modes[m]}
                </option>
              ))}
            </select>
          </label>
        )}
        {status === "world" && shownWinter && (
          <label className={styles.mode}>
            <input
              type="checkbox"
              checked={skeletonOn}
              onChange={(e) => setSkeletonOn(e.target.checked)}
              data-testid="world-skeleton"
            />
            {tw.skeleton}
          </label>
        )}
        {status === "world" && shownWinter && skeletonOn && (
          <div className={styles.legend} data-testid="world-skeleton-legend">
            <span>
              <span className={styles.swatchWood} aria-hidden="true" /> {tw.skeletonWood}
            </span>
            {shownWinter.pruning && (
              <span>
                <span className={styles.swatchPruned} aria-hidden="true" />{" "}
                {tw.skeletonPruned(shownWinter.cuts)}
              </span>
            )}
          </div>
        )}
        {status === "world" && legend && (
          <div className={styles.legend} data-testid="world-legend">
            <span
              className={legend.diverging ? styles.diverging : styles.ramp}
              aria-hidden="true"
            />
            <span>{legend.text}</span>
            <span>{legend.diverging ? tw.growthNote : tw.unmeasured}</span>
          </div>
        )}
      </div>
      {status === "loading" && (
        <p className={styles.status} role="status" data-testid="world-loading">
          {tw.loading}
        </p>
      )}
      {status === "world" && pending && (
        <p className={styles.note} role="status" data-testid="world-loading-visit">
          {tw.loadingVisit}
        </p>
      )}
      {(status === "error" || status === "capped") && (
        <p className={styles.error} role="alert" data-testid="world-error">
          {status === "capped" ? tw.capped : tw.error}
        </p>
      )}
      {status === "world" && tree && (
        <section
          className={styles.panel}
          aria-label={tw.treePanel(tree.code)}
          data-testid="world-tree"
          data-tree-id={tree.id}
        >
          <p className={styles.title} aria-live="polite">
            <strong>{tree.code}</strong> <span>{t.portal.classes[tree.state]}</span>
          </p>
          <CrownFacts
            crown={shownVisit?.crowns[tree.id] ?? null}
            growth={growth.get(tree.id) ?? null}
            winter={shownWinter ? (shownWinter.byTree.get(tree.id) ?? null) : undefined}
            pruning={shownWinter?.pruning ?? false}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => sceneRef.current?.flyTo(tree.id)}
              data-testid="world-fly"
            >
              {tw.flyTo}
            </button>
            <Link href={treeHref(tree.id)} className={styles.link} data-testid="world-card">
              {tt.openCard}
            </Link>
            <button
              type="button"
              className={styles.button}
              onClick={() => setSelected(null)}
              aria-label={tw.close}
              title={tw.close}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </section>
      )}
      {status === "world" && !tree && (
        <p className={styles.caption} data-testid="world-caption">
          {tw.hint} {tw.caption}
        </p>
      )}
    </div>
  );
}

class SignError extends Error {
  constructor(readonly capped: boolean) {
    super(capped ? "capped" : "not signed");
  }
}

function CrownFacts({
  crown,
  growth,
  winter,
  pruning,
}: {
  crown: CrownValues | null;
  growth: Growth | null;
  // A winter scan's skeleton facts of the tree (undefined: not a winter scan).
  winter?: TreeWinter | null;
  pruning: boolean;
}) {
  const rows = (
    [
      [tt.crownHeight, crown?.heightM ?? null, "m"],
      [tt.crownDiameter, crown?.diameterM ?? null, "m"],
      [tt.crownVolume, crown?.volumeM3 ?? null, "m3"],
      [tw.crownBase, crown?.baseM ?? null, "m"],
    ] as [string, CrownMeasure | null, string][]
  ).filter((r): r is [string, CrownMeasure, string] => r[1] !== null);
  const winterRow =
    winter !== undefined && pruning ? (
      <div data-testid="world-tree-cuts">
        <dt>{tw.cuts}</dt>
        <dd>
          {winter && winter.cuts > 0
            ? tw.cutsValue(winter.cuts, formatMeasure(winter.prunedLengthM, "m"))
            : tw.noCuts}
        </dd>
      </div>
    ) : null;
  if (rows.length === 0 && !winterRow) return <p>{tw.noMeasurements}</p>;
  return (
    <dl className={styles.facts} aria-label={tt.crown} data-testid="world-tree-crown">
      {rows.map(([label, m, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatMeasure(m.value, unit, m.uncertainty)}</dd>
        </div>
      ))}
      {winterRow}
      {growth && (
        <div data-testid="world-tree-growth">
          <dt>{tw.growth}</dt>
          <dd>{tw.growthSince(signedMeasure(growth.deltaM), growth.since.label)}</dd>
        </div>
      )}
    </dl>
  );
}

// "+0,32 m", "−0,10 m"; under a centimetre: no change.
function signedMeasure(m: number): string {
  if (Math.abs(m) < 0.005) return tw.noChange;
  const text = formatMeasure(Math.abs(m), "m", null, 2);
  return m > 0 ? `+${text}` : `−${text}`;
}

function sceneTrees(
  frame: LocalFrame,
  trees: WorldTree[],
  visits: WorldVisit[],
  visitId: string,
): SceneTree[] {
  const crowns = visits.find((v) => v.id === visitId)?.crowns ?? {};
  return trees.map((tree) => {
    const crown = crowns[tree.id] ?? null;
    return {
      id: tree.id,
      code: tree.code,
      en: toEN(frame, tree.position),
      guide: crownGuide(crown),
      heightM: crown?.heightM?.value ?? null,
      diameterM: crown?.diameterM?.value ?? null,
      growthM: growthOf(visits, visitId, tree.id)?.deltaM ?? null,
    };
  });
}

function labelText(tree: SceneTree): string {
  return tree.heightM === null ? tree.code : `${tree.code} · ${formatMeasure(tree.heightM, "m")}`;
}
