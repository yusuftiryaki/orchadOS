"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { saveInventoryAction } from "@/app/ofis/parsel/[parcelId]/envanter/actions";
import { formatNumber, t } from "@/lib/i18n";
import {
  saveDraft,
  loadDraft,
  clearDraft,
  type DraftRay,
  type DraftTree,
} from "@/lib/office/draft";
import type { SaveInventoryResult } from "@/lib/office/inventory";
import { bearingDeg, distance, wrap180, type LatLon } from "@/lib/office/local-frame";
import {
  initialVariant,
  nearestPair,
  panoramaImageUrl,
  type PanoramaInfo,
  type PanoramaSetInfo,
} from "@/lib/office/panoramas";
import { frameFor, planLayout, type ParcelGeometry } from "@/lib/office/plan";
import { CORNERS, estimateRowAzimuth, summarize, type Numbering } from "@/lib/office/rows";
import { DEFAULT_TRIANGULATION, triangulate, type Ray } from "@/lib/office/triangulate";
import { verificationCsv, verificationList } from "@/lib/office/verification";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Facts, factsClass } from "@/components/ui/facts";
import { Kbd } from "@/components/ui/kbd";
import { cell, Table } from "@/components/ui/table";
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
  clickedAt: string;
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

// A click of the draft as a trunk label (save_inventory). Drafts written
// before yaw and click time were kept derive yaw from the panorama heading.
function trunkLabel(pano: PanoramaInfo, ray: DraftRay) {
  return {
    panoramaAssetId: pano.assetId,
    gpsTimeNs: /^\d+$/.test(pano.gpsTimeNs) ? pano.gpsTimeNs : null,
    yawDeg: ray.yawDeg ?? wrap180(ray.azimuthDeg - pano.headingDeg),
    pitchDeg: ray.pitchDeg,
    azimuthDeg: ray.azimuthDeg,
    clickedAt: ray.clickedAt ?? null,
  };
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
  const [discardOpen, setDiscardOpen] = useState(false);
  // The last tree deleted from the draft, for undo.
  const [deleted, setDeleted] = useState<{ tree: DraftTree; index: number } | null>(null);

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
      clickedAt: new Date().toISOString(),
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
        yawDeg: r.yawDeg,
        pitchDeg: r.pitchDeg,
        clickedAt: r.clickedAt,
      })),
    };
    setTrees((current) => [...current, tree]);
    setRays([]);
  }, [candidate, frame, rays]);

  const updateTree = (id: string, change: Partial<DraftTree>) =>
    setTrees((current) => current.map((tr) => (tr.id === id ? { ...tr, ...change } : tr)));

  const deleteTree = useCallback(
    (id: string) => {
      const index = trees.findIndex((tr) => tr.id === id);
      if (index >= 0) setDeleted({ tree: trees[index], index });
      setTrees((current) => current.filter((tr) => tr.id !== id));
      setSelectedId(null);
    },
    [trees],
  );

  const undoDelete = () => {
    if (!deleted) return;
    setTrees((current) => [
      ...current.slice(0, deleted.index),
      deleted.tree,
      ...current.slice(deleted.index),
    ]);
    setDeleted(null);
  };

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
          unsure: tr.unsure,
          moved: tr.moved,
          rays: tr.rays.flatMap((r) => {
            const pano = panoramas[panoIndex.get(r.panoramaId) ?? -1];
            return pano ? [trunkLabel(pano, r)] : [];
          }),
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

  // Step tabs (ARIA tablist): arrow keys, Home and End move between steps.
  const tabId = (name: Tab) => `office-step-${name}`;
  const panelId = (name: Tab) => `office-panel-${name}`;
  const panelProps = (name: Tab) => ({
    role: "tabpanel" as const,
    id: panelId(name),
    "aria-labelledby": tabId(name),
  });
  const onTabKey = (event: ReactKeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next]);
    document.getElementById(tabId(TABS[next]))?.focus();
  };
  const tabCount: Partial<Record<Tab, number>> = {
    triangulate: trees.length,
    verification: verification.length,
  };
  const saveState = saveResult?.ok ? "saved" : blocked ? "blocked" : "draft";
  const summaryList = (testId: string, keyed: boolean) =>
    summary && (
      <dl className={styles.summary} data-testid={testId}>
        {(Object.keys(t.office.summary) as (keyof typeof summary)[]).map((key) => (
          <div key={key}>
            <dt>{t.office.summary[key]}</dt>
            <dd data-key={keyed ? key : undefined}>{summary[key]}</dd>
          </div>
        ))}
      </dl>
    );

  return (
    <div className={styles.tool}>
      {restored !== null && restored > 0 && (
        <Alert tone="info" role="status">
          <div className={styles.alertRow}>
            <p>{t.office.draftRestored(restored)}</p>
            <Button variant="secondary" size="sm" onClick={() => setDiscardOpen(true)}>
              {t.office.discardDraft}
            </Button>
          </div>
        </Alert>
      )}
      <Dialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title={t.office.discardTitle}
        closeLabel={t.office.discardCancel}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscardOpen(false)}>
              {t.office.discardCancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearDraft(draftKey);
                setTrees([]);
                setRestored(null);
                setDeleted(null);
                setDiscardOpen(false);
              }}
            >
              {t.office.discardDraft}
            </Button>
          </>
        }
      >
        <p>{t.office.discardConfirm(trees.length)}</p>
      </Dialog>
      {blocked && (
        <Alert tone="warning" title={t.office.existingTitle} testId="existing-inventory">
          <p>{t.office.existingInventory(existing.slots, existing.trees)}</p>
        </Alert>
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
          <p className={styles.mapHint}>{t.office.mapHint}</p>
        </div>
        <div className={styles.side}>
          <div className={styles.stepBar}>
            <div role="tablist" aria-label={t.office.steps} className={styles.steps}>
              {TABS.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  id={tabId(name)}
                  aria-controls={tab === name ? panelId(name) : undefined}
                  aria-selected={tab === name}
                  tabIndex={tab === name ? 0 : -1}
                  className={styles.step}
                  onClick={() => setTab(name)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  <span className={styles.stepNo} aria-hidden>
                    {i + 1}
                  </span>
                  {t.office.tabs[name]}
                  {tabCount[name] !== undefined && (
                    <span className={styles.stepCount}>{tabCount[name]}</span>
                  )}
                </button>
              ))}
            </div>
            <div className={styles.saveState}>
              <Badge
                tone={
                  saveState === "saved" ? "success" : saveState === "blocked" ? "warning" : "info"
                }
                testId="save-state"
              >
                {t.office.saveState[saveState]}
              </Badge>
              {saveState === "draft" && (
                <span className={styles.saveHint}>{t.office.draftHint}</span>
              )}
            </div>
          </div>

          {tab === "triangulate" && (
            <div className={styles.panel} {...panelProps("triangulate")}>
              <div className={styles.viewers}>
                {views.map((view, slot) => {
                  const label = t.office.viewer(slot + 1);
                  if (!view) {
                    return (
                      <div key={slot} className={styles.viewerEmpty}>
                        <strong>{label}</strong>
                        <span>{t.office.viewerEmpty}</span>
                      </div>
                    );
                  }
                  const pano = panoramas[view.index];
                  return (
                    <div key={slot} className={styles.viewerBox} data-testid={`viewer-${slot + 1}`}>
                      <div className={styles.viewerBar}>
                        <strong>{label}</strong>
                        <code className={styles.viewerId} title={pano.id}>
                          {pano.id}
                        </code>
                        <Button variant="secondary" size="sm" onClick={() => stepView(slot, -1)}>
                          {t.office.previousPanorama}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => stepView(slot, 1)}>
                          {t.office.nextPanorama}
                        </Button>
                      </div>
                      <PanoramaViewer
                        url={panoramaImageUrl(set.id, pano.id, initialVariant(pano) ?? "2k")}
                        fullUrl={
                          initialVariant(pano) === "2k" && pano.variants.includes("4k")
                            ? panoramaImageUrl(set.id, pano.id, "4k")
                            : null
                        }
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

              <div className={styles.cards}>
                <section className={styles.card} data-testid="candidate">
                  <div className={styles.cardHead}>
                    <h3>{t.office.candidate}</h3>
                    <span className={styles.count} data-testid="tree-count">
                      {t.office.trees(trees.length)}
                    </span>
                  </div>
                  {rays.length > 0 && (
                    <ul className={styles.rayList} aria-label={t.office.rays}>
                      {rays.map((r) => (
                        <li key={r.panoramaId}>
                          <code className={styles.viewerId}>{r.panoramaId}</code>
                          <span className={styles.num}>
                            {t.office.degrees(fmt(r.azimuthDeg, 1))}
                          </span>
                          <Button
                            variant="quiet"
                            size="sm"
                            aria-label={t.office.removeRay(r.panoramaId)}
                            onClick={() =>
                              setRays((current) =>
                                current.filter((x) => x.panoramaId !== r.panoramaId),
                              )
                            }
                          >
                            {t.office.remove}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {candidate.ok ? (
                    <>
                      <dl className={factsClass.list}>
                        <div className={factsClass.fact}>
                          <dt>{t.office.uncertainty}</dt>
                          <dd data-testid="candidate-uncertainty">
                            {t.office.meters(fmt(candidate.uncertaintyM))}
                          </dd>
                        </div>
                        <div className={factsClass.fact}>
                          <dt>{t.office.angle}</dt>
                          <dd>{t.office.degrees(fmt(candidate.maxAngleDeg, 0))}</dd>
                        </div>
                      </dl>
                      {candidate.warnings.length > 0 && (
                        <Alert tone="warning" role="status">
                          <ul className={styles.warnings}>
                            {candidate.warnings.map((w) => (
                              <li key={w}>{t.office.warnings[w]}</li>
                            ))}
                          </ul>
                        </Alert>
                      )}
                    </>
                  ) : (
                    <p className="muted">
                      {candidate.reason === "parallel" ? t.office.parallel : t.office.needTwoRays}
                    </p>
                  )}
                  <div className={styles.actions}>
                    <Button disabled={!candidate.ok} onClick={addTree}>
                      {t.office.addTree}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={rays.length === 0}
                      onClick={() => setRays([])}
                    >
                      {t.office.clearRays}
                    </Button>
                  </div>
                  <Shortcuts />
                </section>

                {deleted && (
                  <Alert tone="neutral" role="status">
                    <div className={styles.alertRow}>
                      <p>{t.office.treeDeleted}</p>
                      <Button variant="secondary" size="sm" onClick={undoDelete}>
                        {t.office.undo}
                      </Button>
                    </div>
                  </Alert>
                )}

                {selected && (
                  <section className={styles.card} data-testid="selected-tree">
                    <div className={styles.cardHead}>
                      <h3>{t.office.selectedTree}</h3>
                      {codeByTree.get(selected.id) && (
                        <Badge tone="highlight">{codeByTree.get(selected.id)}</Badge>
                      )}
                      {selected.moved && <Badge>{t.office.moved}</Badge>}
                    </div>
                    <Facts
                      rows={[[t.office.uncertainty, t.office.meters(fmt(selected.uncertaintyM))]]}
                    />
                    {selected.warnings.length > 0 && (
                      <Alert tone="warning">
                        <ul className={styles.warnings}>
                          {selected.warnings.map((w) => (
                            <li key={w}>{t.office.warnings[w]}</li>
                          ))}
                        </ul>
                      </Alert>
                    )}
                    <Checkbox
                      id="office-unsure"
                      label={t.office.unsure}
                      checked={selected.unsure}
                      onChange={(e) => updateTree(selected.id, { unsure: e.target.checked })}
                    />
                    <p className={styles.small}>{t.office.dragHint}</p>
                    <div className={styles.actions}>
                      <Button variant="secondary" onClick={() => deleteTree(selected.id)}>
                        {t.office.deleteTree}
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}

          {tab === "coding" && (
            <div className={styles.panel} {...panelProps("coding")}>
              <section className={styles.card}>
                <h3>{t.office.numbering}</h3>
                <p className={styles.small}>
                  {recordedNumbering ? t.office.numberingRecorded : t.office.numberingChoose}
                </p>
                {numberingBlocked && (
                  <Alert tone="warning">
                    <p>{t.office.numberingOpsOnly}</p>
                  </Alert>
                )}
                <div className={styles.fields}>
                  <Field id="office-corner" label={t.office.corner}>
                    <Select
                      value={numbering.corner}
                      disabled={Boolean(recordedNumbering)}
                      onChange={(e) =>
                        setNumbering((n) => ({
                          ...n,
                          corner: e.target.value as Numbering["corner"],
                        }))
                      }
                    >
                      {CORNERS.map((c) => (
                        <option key={c} value={c}>
                          {t.office.corners[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="office-azimuth" label={t.office.rowAzimuth}>
                    <Input
                      type="number"
                      min={0}
                      max={359.99}
                      step={0.1}
                      value={numbering.rowAzimuthDeg}
                      disabled={Boolean(recordedNumbering)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value)) {
                          setNumbering((n) => ({
                            ...n,
                            rowAzimuthDeg: ((value % 360) + 360) % 360,
                          }));
                        }
                      }}
                    />
                  </Field>
                </div>
                {!recordedNumbering && (
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      disabled={trees.length < 3}
                      onClick={() => {
                        const local = trees.map((tr) => frame.toLocal(tr));
                        const az = estimateRowAzimuth(local);
                        if (az !== null) setNumbering((n) => ({ ...n, rowAzimuthDeg: az }));
                      }}
                    >
                      {t.office.estimate}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setNumbering((n) => ({ ...n, rowAzimuthDeg: (n.rowAzimuthDeg + 90) % 360 }))
                      }
                    >
                      {t.office.rotate90}
                    </Button>
                  </div>
                )}
              </section>
              {layout && summary ? (
                <section className={styles.card}>
                  {summaryList("layout-summary", true)}
                  <Facts
                    rows={[
                      [t.office.fittedAzimuth, t.office.degrees(fmt(layout.rowAzimuthDeg))],
                      [
                        t.office.rowSpacing,
                        layout.rowSpacingM ? t.office.meters(fmt(layout.rowSpacingM, 1)) : null,
                      ],
                      [t.office.treeSpacing, t.office.meters(fmt(layout.treeSpacingM, 1))],
                    ]}
                  />
                  <div className={styles.scroll}>
                    <Table data-testid="slot-table" aria-label={t.office.slotList}>
                      <thead>
                        <tr>
                          <th>{t.office.code}</th>
                          <th>{t.office.state}</th>
                          <th className={cell.num}>{t.office.uncertainty}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layout.slots.map((s) => (
                          <tr
                            key={s.code}
                            data-code={s.code}
                            data-tree={s.treeId ?? ""}
                            aria-selected={s.treeId ? s.treeId === selectedId : undefined}
                            className={s.treeId === selectedId ? styles.selectedRow : undefined}
                          >
                            <td className={cell.code}>
                              {s.treeId ? (
                                <button
                                  type="button"
                                  className={styles.rowButton}
                                  onClick={() => setSelectedId(s.treeId)}
                                >
                                  {s.code}
                                </button>
                              ) : (
                                s.code
                              )}
                            </td>
                            <td>{s.treeId ? t.office.treeSlot : t.office.emptySlot}</td>
                            <td className={cell.num}>{t.office.meters(fmt(s.uncertaintyM))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </section>
              ) : (
                <p className="muted">{t.office.layoutNeedsTrees}</p>
              )}
            </div>
          )}

          {tab === "verification" && (
            <div className={styles.panel} {...panelProps("verification")}>
              <section className={styles.card}>
                {verification.length === 0 ? (
                  <p className="muted">{t.office.verificationEmpty}</p>
                ) : (
                  <>
                    <p data-testid="verification-count">
                      {t.office.verificationCount(verification.length)}
                    </p>
                    <div className={styles.scroll}>
                      <Table data-testid="verification-table">
                        <thead>
                          <tr>
                            <th>{t.office.code}</th>
                            <th>{t.office.reason}</th>
                            <th className={cell.num}>{t.office.uncertainty}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {verification.map((v) => (
                            <tr key={v.code} data-code={v.code}>
                              <td className={cell.code}>{v.code}</td>
                              <td>{v.reasons.map((r) => t.office.reasons[r]).join(", ")}</td>
                              <td className={cell.num}>{t.office.meters(fmt(v.uncertaintyM))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}
                <div className={styles.actions}>
                  <Button variant="secondary" disabled={!layout} onClick={downloadCsv}>
                    {t.office.exportCsv}
                  </Button>
                </div>
              </section>
            </div>
          )}

          {tab === "save" && (
            <div className={styles.panel} {...panelProps("save")}>
              <section className={styles.card}>
                <h3>{t.office.savePreview}</h3>
                {summaryList("save-summary", false) ?? (
                  <p className="muted">{t.office.layoutNeedsTrees}</p>
                )}
                {saveResult?.ok ? (
                  <Alert tone="success" role="status" testId="save-result">
                    <p>
                      {t.office.saved(saveResult.slots, saveResult.trees)}
                      {saveResult.labels > 0 && <> {t.office.savedLabels(saveResult.labels)}</>}
                    </p>
                    <div className={styles.actions}>
                      <ButtonLink
                        size="sm"
                        href={`/ofis/parsel/${parcelId}/envanter/duzenle?sekme=verification`}
                        data-testid="open-workspace"
                      >
                        {t.inventory.office.openAfterSave}
                      </ButtonLink>
                      <ButtonLink variant="secondary" size="sm" href={`/ofis/parsel/${parcelId}`}>
                        {t.office.viewParcel}
                      </ButtonLink>
                    </div>
                  </Alert>
                ) : (
                  <>
                    <Checkbox
                      id="office-save-confirm"
                      label={t.office.saveConfirm}
                      checked={confirmed}
                      disabled={blocked || !layout}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <div className={styles.actions}>
                      <Button disabled={blocked || !layout || !confirmed || saving} onClick={save}>
                        {saving ? t.office.saving : t.office.save}
                      </Button>
                    </div>
                    {saveResult && !saveResult.ok && (
                      <Alert tone="danger" role="alert" testId="save-error">
                        <p>
                          {t.office.saveErrors[saveResult.error]}
                          {saveResult.detail ? ` (${saveResult.detail})` : ""}
                        </p>
                      </Alert>
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

// The tool's keyboard shortcuts (the listener above), shown under the
// candidate controls.
function Shortcuts() {
  const s = t.office.shortcuts;
  const k = t.office.keys;
  return (
    <div className={styles.shortcuts}>
      <p className={styles.shortcutsTitle}>{s.title}</p>
      <dl>
        <div>
          <dt>
            <Kbd>{k.enter}</Kbd>
          </dt>
          <dd>{s.add}</dd>
        </div>
        <div>
          <dt>
            <Kbd>{k.escape}</Kbd>
          </dt>
          <dd>{s.clear}</dd>
        </div>
        <div>
          <dt>
            <Kbd>{k.delete}</Kbd>
          </dt>
          <dd>{s.remove}</dd>
        </div>
      </dl>
      <p className={styles.small}>{s.note}</p>
    </div>
  );
}
