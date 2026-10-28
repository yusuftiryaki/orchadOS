"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { formatDate, t } from "@/lib/i18n";
import type { Bounds, FeatureCollection, PointGeometry, PolygonGeometry } from "@/lib/map/geo";
import { MARKER_ORDER, type MarkerState } from "@/lib/map/tree-style";
import { cellFrame, cellRing, cellStats, heatColor } from "@/lib/portal/cells";
import type { PortalSlot, VisitCoverage } from "@/lib/portal/data";
import type { FindingItem } from "@/lib/portal/findings";
import {
  changedTrees,
  COVERAGE_COLORS,
  coverageState,
  stateInVisit,
  type CoverageState,
  type MapVisit,
} from "@/lib/portal/map-layers";
import { ApprovalBadge, findingKindLabel } from "./labels";
import { SEVERITY_TONES } from "./colors";
import { PortalMap, type MapCell, type MapCoverage, type MapSelection } from "./portal-map";
import { Badge, ClassDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import styles from "./parcel.module.css";

// Health map with class filter, legend and a side panel for the selected tree
// or finding. The panel links to the full tree card. A visit selector shows the
// classes of one published visit, "changed in this visit" keeps the trees whose
// class moved against the visit before, and two layers: 10 x 10 m heat cells
// and the scan's coverage (trees seen from two directions; no trace, H05).

export type MapLayer = "heat" | "coverage";

export function HealthMap({
  parcelId,
  boundary,
  slots,
  findings,
  bounds,
  initialStates,
  initialFindingId,
  visits = [],
  coverage = {},
  initialVisitId,
  initialChanged = false,
  initialLayers = [],
}: {
  parcelId: string;
  boundary: PolygonGeometry | null;
  slots: FeatureCollection<PointGeometry, PortalSlot>;
  findings: FindingItem[];
  bounds: Bounds | null;
  initialStates?: MarkerState[];
  initialFindingId?: string;
  // Assessed published visits, newest first.
  visits?: MapVisit[];
  coverage?: Record<string, VisitCoverage>;
  initialVisitId?: string;
  initialChanged?: boolean;
  initialLayers?: MapLayer[];
}) {
  const initialFinding = findings.find((f) => f.id === initialFindingId && f.point);
  const [visible, setVisible] = useState<MarkerState[]>(initialStates ?? MARKER_ORDER);
  // "" = latest state of every tree (tree_latest_assessment).
  const [visitId, setVisitId] = useState<string>(
    visits.some((v) => v.id === initialVisitId) ? initialVisitId! : "",
  );
  const [changedOnly, setChangedOnly] = useState(initialChanged);
  const [layers, setLayers] = useState<MapLayer[]>(initialLayers);
  const [selected, setSelected] = useState<MapSelection>(
    initialFinding ? { kind: "finding", id: initialFinding.id } : null,
  );
  const panelRef = useRef<HTMLElement>(null);

  const visit = visits.find((v) => v.id === visitId) ?? null;
  // "Changed" compares the selected visit (else the latest) with the one before.
  const changeVisit = visit ?? visits[0] ?? null;
  const changed = useMemo(
    () =>
      changeVisit
        ? changedTrees(
            changeVisit,
            visits.find((v) => v.id === changeVisit.previousId),
          )
        : new Set<string>(),
    [changeVisit, visits],
  );
  const stateOf = useCallback(
    (slot: PortalSlot): MarkerState =>
      visit ? stateInVisit(slot.tree?.id ?? null, visit) : slot.state,
    [visit],
  );

  const allSlots = useMemo(
    () =>
      slots.features.map((f) => ({
        slotId: f.properties.slotId,
        code: f.properties.code,
        state: stateOf(f.properties),
        position: f.geometry.coordinates,
        treeId: f.properties.tree?.id ?? null,
      })),
    [slots, stateOf],
  );
  const mapSlots = useMemo(
    () =>
      changedOnly ? allSlots.filter((s) => s.treeId !== null && changed.has(s.treeId)) : allSlots,
    [allSlots, changedOnly, changed],
  );

  const frame = useMemo(
    () =>
      cellFrame(
        boundary ? boundary.coordinates[0] : slots.features.map((f) => f.geometry.coordinates),
      ),
    [boundary, slots],
  );
  const cells = useMemo<MapCell[] | null>(() => {
    if (!layers.includes("heat") || !frame) return null;
    return cellStats(frame, allSlots)
      .filter((c) => c.heat > 0)
      .map((c) => ({ key: c.key, ring: cellRing(frame, c.cx, c.cy), color: heatColor(c.heat) }));
  }, [layers, frame, allSlots]);

  const coverageVisitId = visit?.id ?? visits[0]?.id ?? null;
  const visitCoverage = coverageVisitId ? coverage[coverageVisitId] : undefined;
  const coverageLayer = useMemo<MapCoverage | null>(() => {
    if (!layers.includes("coverage") || !visitCoverage) return null;
    return {
      trees: allSlots
        .filter((s) => s.treeId)
        .map((s) => ({
          id: s.treeId!,
          position: s.position,
          color: COVERAGE_COLORS[coverageState(visitCoverage.directions[s.treeId!] ?? 0)],
        })),
    };
  }, [layers, visitCoverage, allSlots]);
  const coverageCounts = useMemo(() => {
    const c: Record<CoverageState, number> = { covered: 0, partial: 0, none: 0 };
    if (!visitCoverage) return c;
    for (const s of allSlots) {
      if (s.treeId) c[coverageState(visitCoverage.directions[s.treeId] ?? 0)] += 1;
    }
    return c;
  }, [visitCoverage, allSlots]);
  const mapFindings = useMemo(
    () =>
      findings.flatMap((f) =>
        f.point ? [{ id: f.id, severity: f.severity, position: f.point }] : [],
      ),
    [findings],
  );
  const counts = useMemo(() => {
    const c = new Map<MarkerState, number>();
    for (const s of mapSlots) c.set(s.state, (c.get(s.state) ?? 0) + 1);
    return c;
  }, [mapSlots]);

  const slot =
    selected?.kind === "slot"
      ? (slots.features.find((f) => f.properties.slotId === selected.id)?.properties ?? null)
      : null;
  const finding = selected?.kind === "finding" ? findings.find((f) => f.id === selected.id) : null;
  const focus = initialFinding?.point ?? null;

  const select = useCallback((next: MapSelection) => {
    setSelected(next);
    // On a phone the panel sits below the map; bring it into view.
    if (next && window.matchMedia("(max-width: 800px)").matches) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }, []);

  const toggleLayer = (layer: MapLayer) =>
    setLayers((current) =>
      current.includes(layer) ? current.filter((l) => l !== layer) : [...current, layer],
    );
  const m = t.portal.map;

  const toggle = (state: MarkerState) =>
    setVisible((current) =>
      current.includes(state) ? current.filter((s) => s !== state) : [...current, state],
    );

  // Chips for the classes on the map; the selected ones stay even at zero so
  // they can be switched off again.
  const chipStates = MARKER_ORDER.filter(
    (state) => (counts.get(state) ?? 0) > 0 || !visible.includes(state),
  );
  const allVisible = MARKER_ORDER.every((s) => visible.includes(s));

  return (
    <div className={styles.explorer}>
      <div className={styles.mapArea}>
        <PortalMap
          boundary={boundary}
          slots={mapSlots}
          findings={mapFindings}
          bounds={bounds}
          visibleStates={visible}
          selected={selected}
          focus={focus}
          onSelect={select}
          label={t.portal.map.label}
          cells={cells}
          coverage={coverageLayer}
          className={styles.map}
        />
      </div>
      <div className={styles.legendArea}>
        <p className={styles.mapHint}>{t.portal.map.filterHint}</p>
        <ul className={styles.legend} aria-label={t.portal.map.legend}>
          {chipStates.map((state) => (
            <li key={state}>
              <button
                type="button"
                className={styles.filter}
                aria-pressed={visible.includes(state)}
                title={t.portal.classHelp[state]}
                onClick={() => toggle(state)}
                data-state={state}
              >
                <ClassDot value={state} />
                {t.portal.classes[state]}{" "}
                <span className={styles.countInline}>
                  {t.portal.map.count(counts.get(state) ?? 0)}
                </span>
              </button>
            </li>
          ))}
          {!allVisible && (
            <li>
              <button
                type="button"
                className={styles.filter}
                onClick={() => setVisible(MARKER_ORDER)}
              >
                {t.portal.map.all}
              </button>
            </li>
          )}
          {mapFindings.length > 0 && (
            <li className={styles.legendItem} aria-label={t.portal.map.findingLegend}>
              <span className={styles.ring} aria-hidden />
              {t.portal.map.finding}{" "}
              <span className={styles.countInline}>{t.portal.map.count(mapFindings.length)}</span>
            </li>
          )}
        </ul>
        {layers.includes("heat") && <p className={styles.mapHint}>{m.heatLegend}</p>}
        {layers.includes("coverage") &&
          (visitCoverage ? (
            <ul className={styles.legend} data-testid="coverage-legend">
              {(["covered", "partial", "none"] as const).map((c) => (
                <li key={c} className={styles.legendItem}>
                  <span
                    className={styles.ring}
                    style={{ "--ring": COVERAGE_COLORS[c] } as React.CSSProperties}
                    aria-hidden
                  />
                  {m.coverageLegend[c]} {m.count(coverageCounts[c])}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.mapHint}>{m.coverageNone}</p>
          ))}
      </div>
      <aside ref={panelRef} className={`${styles.panelArea} ${styles.noPrint}`}>
        {slot ? (
          <TreePanel
            parcelId={parcelId}
            slot={{ ...slot, state: stateOf(slot) }}
            findings={findings.filter((f) => slot.tree && f.treeId === slot.tree.id)}
            onClose={() => setSelected(null)}
          />
        ) : finding ? (
          <FindingPanel parcelId={parcelId} finding={finding} onClose={() => setSelected(null)} />
        ) : (
          <p className={styles.mapHint}>{t.portal.report.mapHint}</p>
        )}
      </aside>
      <div className={styles.controls} data-testid="map-controls">
        {visits.length > 0 && (
          <div className={styles.controlGroup}>
            <Field id="map-visit" label={m.visit}>
              <Select
                value={visitId}
                onChange={(e) => setVisitId(e.target.value)}
                data-testid="visit-select"
              >
                <option value="">{m.latestState}</option>
                {visits.map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatDate(v.time)}
                  </option>
                ))}
              </Select>
            </Field>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(e) => setChangedOnly(e.target.checked)}
                data-testid="changed-only"
              />
              <span>{m.changedOnly}</span>
              <span className={`${styles.small} muted`} data-testid="changed-count">
                {changeVisit?.previousId ? m.changedCount(changed.size) : m.noPrevious}
              </span>
            </label>
          </div>
        )}
        <fieldset className={styles.fieldset}>
          <legend>{m.layers}</legend>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={layers.includes("heat")}
              onChange={() => toggleLayer("heat")}
              data-testid="layer-heat"
            />
            <span>{m.heat}</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={layers.includes("coverage")}
              onChange={() => toggleLayer("coverage")}
              data-testid="layer-coverage"
            />
            <span>{m.coverage}</span>
          </label>
        </fieldset>
      </div>
    </div>
  );
}

function TreePanel({
  parcelId,
  slot,
  findings,
  onClose,
}: {
  parcelId: string;
  slot: PortalSlot;
  findings: FindingItem[];
  onClose: () => void;
}) {
  const tree = slot.tree;
  const v = t.tree.values;
  const p = t.portal.panel;
  return (
    <section data-testid="tree-panel" className={styles.panel} aria-labelledby="panel-baslik">
      <div className={styles.panelHeading}>
        <h2 id="panel-baslik">{slot.code}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={p.close}>
          ×
        </button>
      </div>
      {tree ? (
        <>
          <div className={styles.classLine}>
            <span className={styles.className}>
              <ClassDot value={slot.state} />
              {t.portal.classes[slot.state]}
            </span>
            {tree.approval && <ApprovalBadge approval={tree.approval} />}
          </div>
          <p className={`${styles.small} muted`}>{t.portal.classHelp[slot.state]}</p>
          <dl className={styles.facts}>
            {tree.assessedVisitTime && (
              <>
                <dt>{p.visit}</dt>
                <dd>{formatDate(tree.assessedVisitTime)}</dd>
              </>
            )}
            <dt>{p.sex}</dt>
            <dd>{v.sex[tree.sex]}</dd>
            <dt>{p.graft}</dt>
            <dd>{v.graft[tree.graft]}</dd>
            <dt>{p.ageClass}</dt>
            <dd>{v.ageClass[tree.ageClass]}</dd>
            <dt>{p.cultivar}</dt>
            <dd>{tree.cultivar ?? t.tree.unknown}</dd>
          </dl>
          {findings.length > 0 && (
            <div className={styles.findingKind}>
              <p className={styles.controlTitle}>{p.findings}</p>
              <ul className={styles.plainList}>
                {findings.map((f) => (
                  <li key={f.id} className={styles.attentionItem}>
                    <Badge tone={SEVERITY_TONES[f.severity]}>{t.portal.severity[f.severity]}</Badge>
                    <span>{f.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.formActions}>
            <ButtonLink href={`/portal/parsel/${parcelId}/agac/${tree.id}`}>
              {p.openCard}
            </ButtonLink>
            <ButtonLink
              variant="secondary"
              href={`/portal/parsel/${parcelId}/gezi?agac=${tree.id}`}
            >
              {p.openTour}
            </ButtonLink>
          </div>
        </>
      ) : (
        <p className="muted">{p.noTree}</p>
      )}
    </section>
  );
}

function FindingPanel({
  parcelId,
  finding,
  onClose,
}: {
  parcelId: string;
  finding: FindingItem;
  onClose: () => void;
}) {
  return (
    <section data-testid="finding-panel" className={styles.panel} aria-labelledby="panel-baslik">
      <div className={styles.panelHeading}>
        <h2 id="panel-baslik">{findingKindLabel(finding.kind)}</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t.portal.panel.close}
        >
          ×
        </button>
      </div>
      <div className={styles.classLine}>
        <Badge tone={SEVERITY_TONES[finding.severity]}>{t.portal.severity[finding.severity]}</Badge>
        <span>{finding.treeCode ?? t.portal.report.parcelLevel}</span>
      </div>
      <p>{finding.description}</p>
      {finding.recommendation && (
        <p className={styles.recommendation}>
          {t.portal.report.recommendation}: {finding.recommendation}
        </p>
      )}
      {finding.treeId && (
        <div className={styles.formActions}>
          <ButtonLink href={`/portal/parsel/${parcelId}/agac/${finding.treeId}`}>
            {t.portal.report.openTree}
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
