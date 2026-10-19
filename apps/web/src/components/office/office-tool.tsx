"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { saveInventoryAction } from "@/app/ofis/parsel/[parcelId]/envanter/actions";
import { formatNumber, t } from "@/lib/i18n";
import { saveDraft, loadDraft, clearDraft, type DraftTree } from "@/lib/office/draft";
import type { SaveInventoryResult } from "@/lib/office/inventory";
import { bearingDeg, distance, wrap180, type LatLon } from "@/lib/office/local-frame";
import {
  nearestPair,
  panoramaImageUrl,
  type PanoramaInfo,
  type PanoramaSetInfo,
} from "@/lib/office/panoramas";
import { frameFor, planLayout, type ParcelGeometry } from "@/lib/office/plan";
import { CORNERS, estimateRowAzimuth, summarize, type Numbering } from "@/lib/office/rows";
import { DEFAULT_TRIANGULATION, triangulate, type Ray } from "@/lib/office/triangulate";
import { verificationCsv, verificationList } from "@/lib/office/verification";
import { OfficeMap, type MapRay } from "./office-map";
import { PanoramaViewer, type ViewerMarker } from "./panorama-viewer";
import styles from "./office-tool.module.css";

type Tab = "triangulate" | "coding" | "verification" | "save";
const TABS: Tab[] = ["triangulate", "coding", "verification", "save"];

interface PendingRay {
  panoramaId: string;
  azimuthDeg: number;
  yawDeg: number;
  pitchDeg: number;
}

interface ViewState {
  index: number;
  lookYawDeg: number;
}

// Rays are drawn this long on the map.
const RAY_LENGTH_M = 30;
// Existing trees are marked in a panorama up to this distance.
const MARKER_RANGE_M = 25;

function fmt(value: number, digits = 2) {
  return formatNumber(value, digits);
}

export function OfficeTool({
  parcelId,
  sessionId,
  set,
  panoramas,
  geometry,
  recordedNumbering,
  canSetNumbering,
  existing,
}: {
  parcelId: string;
  sessionId: string;
  set: PanoramaSetInfo;
  panoramas: PanoramaInfo[];
  geometry: ParcelGeometry;
  recordedNumbering: Numbering | null;
  canSetNumbering: boolean;
  existing: { slots: number; trees: number };
}) {
  const draftKey = `orchados:office:${parcelId}:${sessionId}`;
  // Rendered in the browser only (OfficeToolLoader), so the draft can be read
  // while initialising state.
  const [initialDraft] = useState(() => loadDraft(draftKey));
  const [tab, setTab] = useState<Tab>("triangulate");
  const [trees, setTrees] = useState<DraftTree[]>(initialDraft?.trees ?? []);
  const [restored, setRestored] = useState<number | null>(initialDraft?.trees.length ?? null);
  const [rays, setRays] = useState<PendingRay[]>([]);
  const [views, setViews] = useState<(ViewState | null)[]>([null, null]);
  const [lookVersion, setLookVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [numbering, setNumbering] = useState<Numbering>(
    recordedNumbering ?? initialDraft?.numbering ?? { corner: "sw", rowAzimuthDeg: 0 },
  );
  const [confirmed, setConfirmed] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveInventoryResult | null>(null);
  const [saving, startSaving] = useTransition();

  // The draft is written on every change until the inventory is saved.
  useEffect(() => {
    if (saveResult?.ok) return;
    saveDraft(draftKey, { trees, numbering });
  }, [draftKey, trees, numbering, saveResult]);

  // Triangulation frame: the parcel's local frame (or the panoramas' centre).
  const frame = useMemo(
    () =>
      frameFor(
        geometry,
        panoramas.map((p) => ({ lat: p.lat, lon: p.lon })),
      )!,
    [geometry, panoramas],
  );
  const panoLocal = useMemo(() => panoramas.map((p) => frame.toLocal(p)), [frame, panoramas]);
  const panoIndex = useMemo(() => new Map(panoramas.map((p, i) => [p.id, i])), [panoramas]);

  const candidate = useMemo(() => {
    const input: Ray[] = rays.map((r) => {
      const i = panoIndex.get(r.panoramaId)!;
      return { origin: panoLocal[i], azimuthDeg: r.azimuthDeg, originSdM: panoramas[i].sdHM };
    });
    return triangulate(input);
  }, [rays, panoIndex, panoLocal, panoramas]);

  const layoutResult = useMemo(
    () =>
      planLayout(
        geometry,
        trees.map((tr) => ({ id: tr.id, lat: tr.lat, lon: tr.lon, uncertaintyM: tr.uncertaintyM })),
        numbering,
      ),
    [geometry, trees, numbering],
  );
  const layout = layoutResult?.layout.ok ? layoutResult.layout : null;
  const codeByTree = useMemo(
    () => new Map(layout?.slots.filter((s) => s.treeId).map((s) => [s.treeId!, s.code]) ?? []),
    [layout],
  );

  const verification = useMemo(() => {
    if (!layout || !layoutResult) return [];
    const reviews = new Map(
      trees.map((tr) => [tr.id, { unsure: tr.unsure, warnings: tr.warnings }]),
    );
    return verificationList(
      layout.slots,
      reviews,
      (slot) => layoutResult.frame.toLatLon(slot.position),
      DEFAULT_TRIANGULATION.maxUncertaintyM,
    );
  }, [layout, layoutResult, trees]);
  const flaggedTrees = useMemo(
    () => new Set(verification.filter((v) => v.treeId).map((v) => v.treeId!)),
    [verification],
  );

  // --- Actions ---------------------------------------------------------------

  const openNearest = useCallback(
    (target: LatLon) => {
      const local = frame.toLocal(target);
      const pair = nearestPair(panoLocal, local);
      if (!pair) return;
      setViews(
        pair.map((index) => ({
          index,
          lookYawDeg: wrap180(
            bearingDeg({ x: local.x - panoLocal[index].x, y: local.y - panoLocal[index].y }) -
              panoramas[index].headingDeg,
          ),
        })),
      );
      setLookVersion((v) => v + 1);
      setRays([]);
      setSelectedId(null);
      setTab("triangulate");
    },
    [frame, panoLocal, panoramas],
  );

  const stepView = (slot: number, step: number) => {
    setViews((current) => {
      const view = current[slot];
      if (!view) return current;
      const index = (view.index + step + panoramas.length) % panoramas.length;
      const next = [...current];
      next[slot] = { index, lookYawDeg: view.lookYawDeg };
      return next;
    });
  };

  const addRay = (slot: number, yawDeg: number, pitchDeg: number) => {
    const view = views[slot];
    if (!view) return;
    const pano = panoramas[view.index];
    const ray: PendingRay = {
      panoramaId: pano.id,
      azimuthDeg: (((pano.headingDeg + yawDeg) % 360) + 360) % 360,
      yawDeg,
      pitchDeg,
    };
    setRays((current) => [...current.filter((r) => r.panoramaId !== pano.id), ray]);
  };

  const addTree = useCallback(() => {
    if (!candidate.ok) return;
    const p = frame.toLatLon(candidate.position);
    const tree: DraftTree = {
      id: crypto.randomUUID(),
      lat: p.lat,
      lon: p.lon,
      uncertaintyM: candidate.uncertaintyM,
      warnings: candidate.warnings,
      unsure: false,
      moved: false,
      rays: rays.map((r) => ({
        panoramaId: r.panoramaId,
        azimuthDeg: r.azimuthDeg,
        pitchDeg: r.pitchDeg,
      })),
    };
    setTrees((current) => [...current, tree]);
    setRays([]);
  }, [candidate, frame, rays]);

  const updateTree = (id: string, change: Partial<DraftTree>) =>
    setTrees((current) => current.map((tr) => (tr.id === id ? { ...tr, ...change } : tr)));

  const deleteTree = useCallback((id: string) => {
    setTrees((current) => current.filter((tr) => tr.id !== id));
    setSelectedId(null);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName)) return;
      if (event.key === "Enter" && tab === "triangulate") addTree();
      if (event.key === "Escape") setRays([]);
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        deleteTree(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, addTree, selectedId, deleteTree]);

  const downloadCsv = () => {
    const csv = verificationCsv(verification, {
      header: t.office.csvHeader,
      reasons: t.office.reasons,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = t.office.csvFile;
    a.click();
    URL.revokeObjectURL(url);
  };

  const save = () => {
    startSaving(async () => {
      const result = await saveInventoryAction({
        parcelId,
        sessionId,
        numbering,
        trees: trees.map((tr) => ({
          id: tr.id,
          lat: tr.lat,
          lon: tr.lon,
          uncertaintyM: tr.uncertaintyM,
        })),
      });
      setSaveResult(result);
      if (result.ok) clearDraft(draftKey);
    });
  };

  // --- Map data ----------------------------------------------------------------

  const activeKey = views
    .filter((v): v is ViewState => v !== null)
    .map((v) => panoramas[v.index].id)
    .join(",");
  const mapPanoramas = useMemo(() => {
    const active = new Set(activeKey.split(","));
    return panoramas.map((p) => ({
      id: p.id,
      position: { lat: p.lat, lon: p.lon },
      active: active.has(p.id),
    }));
  }, [panoramas, activeKey]);
  const mapRays: MapRay[] = useMemo(
    () =>
      rays.map((r) => {
        const o = panoLocal[panoIndex.get(r.panoramaId)!];
        const rad = (r.azimuthDeg * Math.PI) / 180;
        return {
          from: frame.toLatLon(o),
          to: frame.toLatLon({
            x: o.x + Math.sin(rad) * RAY_LENGTH_M,
            y: o.y + Math.cos(rad) * RAY_LENGTH_M,
          }),
        };
      }),
    [rays, panoLocal, panoIndex, frame],
  );
  const mapTrees = useMemo(
    () =>
      trees.map((tr) => ({
        id: tr.id,
        position: { lat: tr.lat, lon: tr.lon },
        selected: tr.id === selectedId,
        flagged: flaggedTrees.has(tr.id),
        code: codeByTree.get(tr.id) ?? null,
      })),
    [trees, selectedId, flaggedTrees, codeByTree],
  );
  const showLayout = tab !== "triangulate" && layout && layoutResult;
  const emptySlots = useMemo(
    () =>
      showLayout
        ? layout.slots
            .filter((s) => !s.treeId)
            .map((s) => ({ code: s.code, position: layoutResult.frame.toLatLon(s.position) }))
        : [],
    [showLayout, layout, layoutResult],
  );
  const rowLines = useMemo(
    () =>
      showLayout
        ? layout.rowLines.map((l) => ({
            from: layoutResult.frame.toLatLon(l.from),
            to: layoutResult.frame.toLatLon(l.to),
          }))
        : [],
    [showLayout, layout, layoutResult],
  );
  const candidateLatLon = useMemo(
    () => (candidate.ok ? frame.toLatLon(candidate.position) : null),
    [candidate, frame],
  );

  const viewerMarkers = useMemo(
    () =>
      views.map((view): ViewerMarker[] => {
        if (!view) return [];
        const pano = panoramas[view.index];
        const o = panoLocal[view.index];
        const out: ViewerMarker[] = [];
        for (const tr of trees) {
          const p = frame.toLocal(tr);
          const d = distance(o, p);
          if (d > MARKER_RANGE_M || d < 0.5) continue;
          out.push({
            id: `tree-${tr.id}`,
            yawDeg: wrap180(bearingDeg({ x: p.x - o.x, y: p.y - o.y }) - pano.headingDeg),
            // Mark the trunk one metre above the ground.
            pitchDeg: (Math.atan2(1 - set.cameraHeightM, d) * 180) / Math.PI,
            kind: "tree",
          });
        }
        const ray = rays.find((r) => r.panoramaId === pano.id);
        if (ray) {
          out.push({ id: "click", yawDeg: ray.yawDeg, pitchDeg: ray.pitchDeg, kind: "click" });
        }
        return out;
      }),
    [views, panoramas, panoLocal, trees, frame, rays, set.cameraHeightM],
  );

  const selected = trees.find((tr) => tr.id === selectedId) ?? null;
  const summary = layout ? summarize(layout.slots) : null;
  const blocked = existing.slots > 0 || existing.trees > 0;
  const numberingBlocked = !recordedNumbering && !canSetNumbering;

  return (
    <div className={styles.tool}>
      {restored !== null && restored > 0 && (
        <p className={styles.notice} role="status">
          {t.office.draftRestored(restored)}{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              if (!window.confirm(t.office.discardConfirm)) return;
              clearDraft(draftKey);
              setTrees([]);
              setRestored(null);
            }}
          >
            {t.office.discardDraft}
          </button>
        </p>
      )}
      {blocked && (
        <p className={styles.blocked} role="alert" data-testid="existing-inventory">
          {t.office.existingInventory(existing.slots, existing.trees)}
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.mapColumn}>
          <OfficeMap
            boundary={geometry.boundary}
            panoramas={mapPanoramas}
            rays={mapRays}
            candidate={candidateLatLon}
            trees={mapTrees}
            emptySlots={emptySlots}
            rowLines={rowLines}
            onMapClick={openNearest}
            onTreeClick={(id) => setSelectedId(id)}
            onTreeMove={(id, p) => updateTree(id, { lat: p.lat, lon: p.lon, moved: true })}
          />
          <p className="muted">{t.office.mapHint}</p>
        </div>
        <div className={styles.side}>
          <nav className={styles.tabs} role="tablist">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                className={tab === name ? styles.tabActive : styles.tab}
                onClick={() => setTab(name)}
              >
                {t.office.tabs[name]}
              </button>
            ))}
          </nav>

          {tab === "triangulate" && (
            <div className={styles.panel}>
              <div className={styles.viewers}>
                {views.map((view, slot) => {
                  const label = t.office.viewer(slot + 1);
                  if (!view) {
                    return (
                      <div key={slot} className={styles.viewerEmpty}>
                        {t.office.viewerEmpty}
                      </div>
                    );
                  }
                  const pano = panoramas[view.index];
                  return (
                    <div key={slot} className={styles.viewerBox} data-testid={`viewer-${slot + 1}`}>
                      <div className={styles.viewerBar}>
                        <strong>{label}</strong>
                        <span className="muted">{pano.id}</span>
                        <span className={styles.spacer} />
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => stepView(slot, -1)}
                        >
                          {t.office.previousPanorama}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => stepView(slot, 1)}
                        >
                          {t.office.nextPanorama}
                        </button>
                      </div>
                      <PanoramaViewer
                        url={panoramaImageUrl(set.id, pano.id, "2k")}
                        panoramaId={pano.id}
                        lookYawDeg={view.lookYawDeg}
                        lookVersion={lookVersion}
                        markers={viewerMarkers[slot]}
                        onClick={(yaw, pitch) => addRay(slot, yaw, pitch)}
                        label={label}
                      />
                    </div>
                  );
                })}
              </div>

              <section className={styles.candidate} data-testid="candidate">
                <h3>{t.office.candidate}</h3>
                {rays.length > 0 && (
                  <ul className={styles.rayList}>
                    {rays.map((r) => (
                      <li key={r.panoramaId}>
                        {t.office.rayLine(r.panoramaId, fmt(r.azimuthDeg, 1))}{" "}
                        <button
                          type="button"
                          className={styles.linkButton}
                          aria-label={t.office.removeRay}
                          onClick={() =>
                            setRays((current) =>
                              current.filter((x) => x.panoramaId !== r.panoramaId),
                            )
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {candidate.ok ? (
                  <>
                    <dl className={styles.facts}>
                      <dt>{t.office.uncertainty}</dt>
                      <dd data-testid="candidate-uncertainty">
                        {t.office.meters(fmt(candidate.uncertaintyM))}
                      </dd>
                      <dt>{t.office.angle}</dt>
                      <dd>{t.office.degrees(fmt(candidate.maxAngleDeg, 0))}</dd>
                    </dl>
                    {candidate.warnings.length > 0 && (
                      <ul className={styles.warnings} role="alert">
                        {candidate.warnings.map((w) => (
                          <li key={w}>{t.office.warnings[w]}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    {candidate.reason === "parallel" ? t.office.parallel : t.office.needTwoRays}
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="button"
                    disabled={!candidate.ok}
                    onClick={addTree}
                  >
                    {t.office.addTree}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={rays.length === 0}
                    onClick={() => setRays([])}
                  >
                    {t.office.clearRays}
                  </button>
                  <span className="muted" data-testid="tree-count">
                    {t.office.trees(trees.length)}
                  </span>
                </div>
              </section>

              {selected && (
                <section className={styles.candidate} data-testid="selected-tree">
                  <h3>
                    {t.office.selectedTree}
                    {codeByTree.get(selected.id) ? ` · ${codeByTree.get(selected.id)}` : ""}
                  </h3>
                  <dl className={styles.facts}>
                    <dt>{t.office.uncertainty}</dt>
                    <dd>{t.office.meters(fmt(selected.uncertaintyM))}</dd>
                  </dl>
                  {selected.warnings.length > 0 && (
                    <ul className={styles.warnings}>
                      {selected.warnings.map((w) => (
                        <li key={w}>{t.office.warnings[w]}</li>
                      ))}
                    </ul>
                  )}
                  {selected.moved && <p className="muted">{t.office.moved}</p>}
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={selected.unsure}
                      onChange={(e) => updateTree(selected.id, { unsure: e.target.checked })}
                    />
                    {t.office.unsure}
                  </label>
                  <p className="muted">{t.office.dragHint}</p>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => deleteTree(selected.id)}
                  >
                    {t.office.deleteTree}
                  </button>
                </section>
              )}
            </div>
          )}

          {tab === "coding" && (
            <div className={styles.panel}>
              <section className={styles.candidate}>
                <h3>{t.office.numbering}</h3>
                <p className="muted">
                  {recordedNumbering ? t.office.numberingRecorded : t.office.numberingChoose}
                </p>
                {numberingBlocked && (
                  <p className={styles.warnings} role="alert">
                    {t.office.numberingOpsOnly}
                  </p>
                )}
                <label className={styles.field}>
                  {t.office.corner}
                  <select
                    value={numbering.corner}
                    disabled={Boolean(recordedNumbering)}
                    onChange={(e) =>
                      setNumbering((n) => ({ ...n, corner: e.target.value as Numbering["corner"] }))
                    }
                  >
                    {CORNERS.map((c) => (
                      <option key={c} value={c}>
                        {t.office.corners[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  {t.office.rowAzimuth}
                  <input
                    type="number"
                    min={0}
                    max={359.99}
                    step={0.1}
                    value={numbering.rowAzimuthDeg}
                    disabled={Boolean(recordedNumbering)}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value)) {
                        setNumbering((n) => ({ ...n, rowAzimuthDeg: ((value % 360) + 360) % 360 }));
                      }
                    }}
                  />
                </label>
                {!recordedNumbering && (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={trees.length < 3}
                      onClick={() => {
                        const local = trees.map((tr) => frame.toLocal(tr));
                        const az = estimateRowAzimuth(local);
                        if (az !== null) setNumbering((n) => ({ ...n, rowAzimuthDeg: az }));
                      }}
                    >
                      {t.office.estimate}
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        setNumbering((n) => ({ ...n, rowAzimuthDeg: (n.rowAzimuthDeg + 90) % 360 }))
                      }
                    >
                      {t.office.rotate90}
                    </button>
                  </div>
                )}
              </section>
              {layout && summary ? (
                <section className={styles.candidate}>
                  <dl className={styles.summary} data-testid="layout-summary">
                    {(Object.keys(t.office.summary) as (keyof typeof summary)[]).map((key) => (
                      <div key={key}>
                        <dt>{t.office.summary[key]}</dt>
                        <dd data-key={key}>{summary[key]}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="muted">
                    {t.office.fittedAzimuth(fmt(layout.rowAzimuthDeg))}
                    {" · "}
                    {t.office.spacing(
                      layout.rowSpacingM ? fmt(layout.rowSpacingM, 1) : "—",
                      fmt(layout.treeSpacingM, 1),
                    )}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table} data-testid="slot-table">
                      <thead>
                        <tr>
                          <th>{t.office.code}</th>
                          <th>{t.office.state}</th>
                          <th>{t.office.uncertainty}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layout.slots.map((s) => (
                          <tr
                            key={s.code}
                            data-code={s.code}
                            data-tree={s.treeId ?? ""}
                            className={s.treeId === selectedId ? styles.selectedRow : undefined}
                            onClick={() => s.treeId && setSelectedId(s.treeId)}
                          >
                            <td>{s.code}</td>
                            <td>{s.treeId ? t.office.treeSlot : t.office.emptySlot}</td>
                            <td>{fmt(s.uncertaintyM)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <p className="muted">{t.office.layoutNeedsTrees}</p>
              )}
            </div>
          )}

          {tab === "verification" && (
            <div className={styles.panel}>
              <section className={styles.candidate}>
                {verification.length === 0 ? (
                  <p className="muted">{t.office.verificationEmpty}</p>
                ) : (
                  <>
                    <p data-testid="verification-count">
                      {t.office.verificationCount(verification.length)}
                    </p>
                    <div className={styles.tableWrap}>
                      <table className={styles.table} data-testid="verification-table">
                        <thead>
                          <tr>
                            <th>{t.office.code}</th>
                            <th>{t.office.reason}</th>
                            <th>{t.office.uncertainty}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {verification.map((v) => (
                            <tr key={v.code} data-code={v.code}>
                              <td>{v.code}</td>
                              <td>{v.reasons.map((r) => t.office.reasons[r]).join(", ")}</td>
                              <td>{fmt(v.uncertaintyM)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={!layout}
                    onClick={downloadCsv}
                  >
                    {t.office.exportCsv}
                  </button>
                </div>
              </section>
            </div>
          )}

          {tab === "save" && (
            <div className={styles.panel}>
              <section className={styles.candidate}>
                <h3>{t.office.savePreview}</h3>
                {summary ? (
                  <dl className={styles.summary} data-testid="save-summary">
                    {(Object.keys(t.office.summary) as (keyof typeof summary)[]).map((key) => (
                      <div key={key}>
                        <dt>{t.office.summary[key]}</dt>
                        <dd>{summary[key]}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="muted">{t.office.layoutNeedsTrees}</p>
                )}
                {saveResult?.ok ? (
                  <p className={styles.success} role="status" data-testid="save-result">
                    {t.office.saved(saveResult.slots, saveResult.trees)}{" "}
                    <Link href={`/ofis/parsel/${parcelId}`}>{t.office.viewParcel}</Link>
                  </p>
                ) : (
                  <>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={blocked || !layout}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {t.office.saveConfirm}
                    </label>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="button"
                        disabled={blocked || !layout || !confirmed || saving}
                        onClick={save}
                      >
                        {saving ? t.office.saving : t.office.save}
                      </button>
                    </div>
                    {saveResult && !saveResult.ok && (
                      <p className={styles.blocked} role="alert" data-testid="save-error">
                        {t.office.saveErrors[saveResult.error]}
                        {saveResult.detail ? ` (${saveResult.detail})` : ""}
                      </p>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
