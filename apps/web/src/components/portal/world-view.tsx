"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signTourWorldAction } from "@/app/portal/parsel/[parcelId]/gezi/actions";
import { formatMeasure, t } from "@/lib/i18n";
import type { Position } from "@/lib/map/geo";
import { prefersReducedMotion } from "@/lib/map/motion";
import type { MarkerState } from "@/lib/map/tree-style";
import { crownGuide, type CrownMeasure, type CrownValues } from "@/lib/portal/crown-guide";
import { parseWorldCloud, type WorldCloud } from "@/lib/world/format";
import { localFrame, toEN } from "@/lib/world/geometry";
import { WorldScene, type ColorMode, type SceneTree } from "./world-scene";
import styles from "./world.module.css";

// The 3D world of the visit on screen (docs/3d-dunya.md), over the tour
// viewer: signs and downloads the visit's world cloud, then hands it to
// WorldScene, which starts at the panorama's exact view and turns the photo
// into the cloud. The overlay holds the way back, the colour modes, the
// selected tree's measurements and the tree labels.
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
  crown: CrownValues | null;
}

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
  assetId,
  start,
  cameraHeightM,
  trees,
  treeHref,
  onExit,
}: {
  parcelId: string;
  assetId: string;
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
  const [status, setStatus] = useState<Status>("loading");
  const [progress, setProgress] = useState<number | null>(null);
  const [mode, setMode] = useState<ColorMode>("photo");
  const [selected, setSelected] = useState<string | null>(null);
  // The opening view and callbacks are read once, when the scene is built.
  const startRef = useRef({ start, cameraHeightM, trees, onExit });
  useEffect(() => {
    startRef.current.onExit = onExit;
  });

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // Sign, download, parse, build.
  useEffect(() => {
    const abort = new AbortController();
    let scene: WorldScene | null = null;
    (async () => {
      const signed = await signTourWorldAction(parcelId, assetId);
      if (abort.signal.aborted) return;
      if (!signed.url) {
        setStatus(signed.capped ? "capped" : "error");
        return;
      }
      const buffer = await download(signed.url, abort.signal, setProgress);
      const cloud = parseWorldCloud(buffer);
      if (abort.signal.aborted || !stageRef.current || !labelsRef.current) return;
      const { start: view, cameraHeightM: height, trees: list } = startRef.current;
      scene = new WorldScene({
        container: stageRef.current,
        labels: labelsRef.current,
        cloud,
        photoUrl: view.photoUrl,
        eyeEN: toEN(frameOf(cloud), view.position),
        headingDeg: view.headingDeg,
        yawDeg: view.yawDeg,
        pitchDeg: view.pitchDeg,
        fovDeg: view.fovDeg,
        cameraHeightM: height,
        trees: sceneTrees(cloud, list),
        reducedMotion: prefersReducedMotion(),
        labelText,
        onSelect: setSelected,
        onEntered: () => setStatus("world"),
      });
      sceneRef.current = scene;
      setStatus("entering");
    })().catch(() => {
      if (!abort.signal.aborted) setStatus("error");
    });
    return () => {
      abort.abort();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [parcelId, assetId]);

  useEffect(() => {
    sceneRef.current?.select(selected);
  }, [selected, status]);

  useEffect(() => {
    sceneRef.current?.setColorMode(mode);
  }, [mode, status]);

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

  const tree = useMemo(() => trees.find((x) => x.id === selected) ?? null, [trees, selected]);
  const legend = useMemo(() => {
    if (mode === "photo") return null;
    const values = trees
      .map((x) => (mode === "height" ? x.crown?.heightM : x.crown?.diameterM)?.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return null;
    return tw.legend(
      formatMeasure(Math.min(...values), "m"),
      formatMeasure(Math.max(...values), "m"),
    );
  }, [trees, mode]);

  const busy = status === "loading" || status === "entering" || status === "exiting";

  return (
    <div
      ref={rootRef}
      className={styles.world}
      role="region"
      aria-label={tw.region}
      aria-busy={busy}
      tabIndex={-1}
      data-testid="world"
      data-status={status}
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
        {status === "world" && (
          <label className={styles.mode}>
            {tw.colorMode}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as ColorMode)}
              data-testid="world-mode"
            >
              {(Object.keys(tw.modes) as ColorMode[]).map((m) => (
                <option key={m} value={m}>
                  {tw.modes[m]}
                </option>
              ))}
            </select>
          </label>
        )}
        {status === "world" && legend && (
          <div className={styles.legend} data-testid="world-legend">
            <span className={styles.ramp} aria-hidden="true" />
            <span>{legend}</span>
            <span>{tw.unmeasured}</span>
          </div>
        )}
      </div>
      {status === "loading" && (
        <p className={styles.status} role="status" data-testid="world-loading">
          {progress === null ? tw.loading : tw.loadingPercent(progress)}
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
          <CrownFacts crown={tree.crown} />
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

function CrownFacts({ crown }: { crown: CrownValues | null }) {
  const rows = (
    [
      [tt.crownHeight, crown?.heightM ?? null, "m"],
      [tt.crownDiameter, crown?.diameterM ?? null, "m"],
      [tt.crownVolume, crown?.volumeM3 ?? null, "m3"],
      [tw.crownBase, crown?.baseM ?? null, "m"],
    ] as [string, CrownMeasure | null, string][]
  ).filter((r): r is [string, CrownMeasure, string] => r[1] !== null);
  if (rows.length === 0) return <p>{tw.noMeasurements}</p>;
  return (
    <dl className={styles.facts} aria-label={tt.crown} data-testid="world-tree-crown">
      {rows.map(([label, m, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatMeasure(m.value, unit, m.uncertainty)}</dd>
        </div>
      ))}
    </dl>
  );
}

function frameOf(cloud: WorldCloud) {
  return localFrame(cloud.header.origin_lat, cloud.header.origin_lon);
}

function sceneTrees(cloud: WorldCloud, trees: WorldTree[]): SceneTree[] {
  const frame = frameOf(cloud);
  return trees.map((tree) => ({
    id: tree.id,
    code: tree.code,
    en: toEN(frame, tree.position),
    guide: crownGuide(tree.crown),
    heightM: tree.crown?.heightM?.value ?? null,
    diameterM: tree.crown?.diameterM?.value ?? null,
  }));
}

function labelText(tree: SceneTree): string {
  return tree.heightM === null ? tree.code : `${tree.code} · ${formatMeasure(tree.heightM, "m")}`;
}

// Downloads with progress (percent, when the size is known).
async function download(
  url: string,
  signal: AbortSignal,
  onProgress: (percent: number | null) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastPercent = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) {
      const percent = Math.min(100, Math.floor((received / total) * 100));
      if (percent !== lastPercent) onProgress((lastPercent = percent));
    }
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}
