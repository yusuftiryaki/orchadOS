"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { formatDate, t } from "@/lib/i18n";
import type { Bounds, FeatureCollection, PointGeometry, PolygonGeometry } from "@/lib/map/geo";
import { MARKER_COLORS, MARKER_ORDER, type MarkerState } from "@/lib/map/tree-style";
import type { PortalSlot } from "@/lib/portal/data";
import type { FindingItem } from "@/lib/portal/findings";
import { ApprovalBadge, findingKindLabel } from "./labels";
import { SEVERITY_COLORS } from "./colors";
import { PortalMap, type MapSelection } from "./portal-map";
import styles from "./portal.module.css";

// Health map with class filter, legend and a side panel for the selected tree
// or finding. The panel links to the full tree card.

export function HealthMap({
  parcelId,
  boundary,
  slots,
  findings,
  bounds,
  initialStates,
  initialFindingId,
}: {
  parcelId: string;
  boundary: PolygonGeometry | null;
  slots: FeatureCollection<PointGeometry, PortalSlot>;
  findings: FindingItem[];
  bounds: Bounds | null;
  initialStates?: MarkerState[];
  initialFindingId?: string;
}) {
  const initialFinding = findings.find((f) => f.id === initialFindingId && f.point);
  const [visible, setVisible] = useState<MarkerState[]>(initialStates ?? MARKER_ORDER);
  const [selected, setSelected] = useState<MapSelection>(
    initialFinding ? { kind: "finding", id: initialFinding.id } : null,
  );
  const panelRef = useRef<HTMLElement>(null);

  const mapSlots = useMemo(
    () =>
      slots.features.map((f) => ({
        slotId: f.properties.slotId,
        code: f.properties.code,
        state: f.properties.state,
        position: f.geometry.coordinates,
      })),
    [slots],
  );
  const mapFindings = useMemo(
    () =>
      findings.flatMap((f) =>
        f.point ? [{ id: f.id, severity: f.severity, position: f.point }] : [],
      ),
    [findings],
  );
  const counts = useMemo(() => {
    const c = new Map<MarkerState, number>();
    for (const f of slots.features) c.set(f.properties.state, (c.get(f.properties.state) ?? 0) + 1);
    return c;
  }, [slots]);

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

  const toggle = (state: MarkerState) =>
    setVisible((current) =>
      current.includes(state) ? current.filter((s) => s !== state) : [...current, state],
    );

  return (
    <div className={styles.explorer}>
      <div className={styles.mapColumn}>
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
        />
        <div className={styles.noPrint}>
          <p className={`muted ${styles.small}`}>{t.portal.map.filterHint}</p>
          <ul className={styles.legend} aria-label={t.portal.map.legend}>
            {MARKER_ORDER.map((state) => (
              <li key={state}>
                <button
                  type="button"
                  className={styles.filter}
                  aria-pressed={visible.includes(state)}
                  title={t.portal.classHelp[state]}
                  onClick={() => toggle(state)}
                  data-state={state}
                >
                  <span className={styles.swatch} style={{ background: MARKER_COLORS[state] }} />
                  {t.portal.classes[state]} {t.portal.map.count(counts.get(state) ?? 0)}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={styles.filter}
                onClick={() => setVisible(MARKER_ORDER)}
              >
                {t.portal.map.all}
              </button>
            </li>
            {mapFindings.length > 0 && (
              <li className={styles.filter} aria-label={t.portal.map.findingLegend}>
                <span className={styles.ring} />
                {t.portal.map.finding} {t.portal.map.count(mapFindings.length)}
              </li>
            )}
          </ul>
        </div>
      </div>
      <aside ref={panelRef} className={`${styles.panel} ${styles.noPrint}`}>
        {slot ? (
          <TreePanel
            parcelId={parcelId}
            slot={slot}
            findings={findings.filter((f) => slot.tree && f.treeId === slot.tree.id)}
            onClose={() => setSelected(null)}
          />
        ) : finding ? (
          <FindingPanel parcelId={parcelId} finding={finding} onClose={() => setSelected(null)} />
        ) : (
          <p className="muted">{t.portal.report.mapHint}</p>
        )}
      </aside>
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
    <section data-testid="tree-panel" className={styles.panelBody}>
      <div className={styles.panelHeading}>
        <h2>{slot.code}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={p.close}>
          ×
        </button>
      </div>
      {tree ? (
        <>
          <div className={styles.classBadge}>
            <span className={styles.swatch} style={{ background: MARKER_COLORS[slot.state] }} />
            {t.portal.classes[slot.state]}
          </div>
          <p className={`muted ${styles.small}`}>{t.portal.classHelp[slot.state]}</p>
          {tree.approval && <ApprovalBadge approval={tree.approval} />}
          <dl className={styles.facts}>
            <dt>{p.health}</dt>
            <dd>{t.portal.classes[tree.health ?? "unassessed"]}</dd>
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
            <div>
              <strong>{p.findings}</strong>
              <ul className={styles.plainList}>
                {findings.map((f) => (
                  <li key={f.id}>
                    <span style={{ color: SEVERITY_COLORS[f.severity] }}>
                      {t.portal.severity[f.severity]}
                    </span>
                    {": "}
                    {f.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={styles.actions}>
            <Link className="button" href={`/portal/parsel/${parcelId}/agac/${tree.id}`}>
              {p.openCard}
            </Link>
            <Link
              className="button button-secondary"
              href={`/portal/parsel/${parcelId}/gezi?agac=${tree.id}`}
            >
              {p.openTour}
            </Link>
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
    <section data-testid="finding-panel" className={styles.panelBody}>
      <div className={styles.panelHeading}>
        <h2>{findingKindLabel(finding.kind)}</h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t.portal.panel.close}
        >
          ×
        </button>
      </div>
      <p>
        <strong style={{ color: SEVERITY_COLORS[finding.severity] }}>
          {t.portal.severity[finding.severity]}
        </strong>
        {" · "}
        {finding.treeCode ?? t.portal.report.parcelLevel}
      </p>
      <p>{finding.description}</p>
      {finding.recommendation && (
        <p>
          <strong>{t.portal.report.recommendation}: </strong>
          {finding.recommendation}
        </p>
      )}
      {finding.treeId && (
        <Link className="button" href={`/portal/parsel/${parcelId}/agac/${finding.treeId}`}>
          {t.portal.report.openTree}
        </Link>
      )}
    </section>
  );
}
