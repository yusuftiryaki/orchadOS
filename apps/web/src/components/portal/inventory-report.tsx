import Link from "next/link";
import { DemoNotice } from "@/components/demo/demo-notice";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import {
  INVENTORY_POINT_COLORS,
  type InventoryReport,
  type MapPoint,
} from "@/lib/portal/inventory-report";
import ir from "./inventory-report.module.css";
import styles from "./portal.module.css";

// Owner's inventory report (src/lib/portal/inventory-report.ts): sections in
// the order of the expert agent's proposal, plain language, counts only.

const r = t.inventoryReport;
const v = t.tree.values;

const pct = (n: number, total: number) => (total > 0 ? formatNumber((n / total) * 100, 0) : "0");
const signedPct = (share: number) => `${share > 0 ? "+" : ""}%${formatNumber(share * 100, 0)}`;
const area = (m2: number) => `${formatNumber(m2 / 1000, 1)} dönüm (${formatNumber(m2, 0)} m²)`;

export function InventoryReportView({
  report,
  pdfLimit = false,
}: {
  report: InventoryReport;
  // A demo session over its PDF cap was sent back here.
  pdfLimit?: boolean;
}) {
  const base = `/portal/parsel/${report.parcel.id}`;
  const c = report.counts;
  const draft = report.warnings.includes("boundary_unapproved");
  return (
    <main className={styles.page} data-testid="inventory-report">
      <p className={styles.noPrint}>
        <Link href={base}>← {r.back}</Link>
      </p>
      <div className={styles.titleRow}>
        <div>
          <p className={ir.eyebrow}>{r.title}</p>
          <h1>{report.parcel.name}</h1>
          <p className="muted">
            {[
              report.parcel.place,
              report.inventory?.date ? r.subtitle(formatDate(report.inventory.date)) : null,
              report.inventory?.approvedAt
                ? r.approvedOn(formatDate(report.inventory.approvedAt))
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {report.inventory && (
          <div className={`${styles.actions} ${styles.noPrint}`}>
            <a className="button" href={`${base}/envanter/rapor.pdf`} data-testid="inventory-pdf">
              {r.pdf}
            </a>
          </div>
        )}
      </div>
      {pdfLimit && <DemoNotice text={demoText.closed.pdfLimit} />}

      {!report.inventory ? (
        <p className={styles.notice} data-testid="inventory-not-approved">
          {r.notApproved}
        </p>
      ) : (
        <>
          {draft && <p className={styles.notice}>{r.draft}</p>}
          <section className={styles.section} aria-labelledby="ozet">
            <h2 id="ozet">{r.summaryTitle}</h2>
            <p className={ir.lead} data-testid="inventory-summary">
              {r.summary(c.slots, c.trees, c.emptySlots, c.interstitialTrees)}
              {report.estimate && (
                <> {r.estimateLine(report.estimate.declared, signedPct(report.estimate.share))}</>
              )}
            </p>
            <div className={ir.statGrid}>
              <Stat label={r.legend.slots} value={c.slots} />
              <Stat label={r.legend.tree} value={c.rowTrees} />
              <Stat label={r.legend.interstitial} value={c.interstitialTrees} />
              <Stat label={r.legend.empty} value={c.emptySlots} />
            </div>
            <p className="muted">{r.terms}</p>
            <p className="muted">{r.disclaimer}</p>
          </section>

          {report.warnings.length > 0 && (
            <section className={styles.section} aria-labelledby="dikkat">
              <h2 id="dikkat">{r.warningsTitle}</h2>
              <ul className={ir.warningList} data-testid="inventory-warnings">
                {report.warnings.map((w) => (
                  <li key={w}>{r.warnings[w]}</li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.section} aria-labelledby="harita">
            <h2 id="harita">{r.mapTitle}</h2>
            <p className="muted">{r.mapHint}</p>
            {report.map && <SlotMap map={report.map} />}
          </section>

          <section className={styles.section} aria-labelledby="sinir">
            <h2 id="sinir">{r.boundaryTitle}</h2>
            {report.boundary ? (
              <>
                {report.boundary.areaM2 !== null && (
                  <p>{r.boundaryArea(area(report.boundary.areaM2))}</p>
                )}
                {report.area && (
                  <p>
                    {r.boundaryDeclared(area(report.area.declaredM2), signedPct(report.area.share))}
                  </p>
                )}
                <p>
                  {report.boundary.approvedAt
                    ? r.boundaryApproved(formatDate(report.boundary.approvedAt))
                    : report.boundary.fieldSurvey
                      ? r.boundaryAwaiting
                      : null}
                </p>
                <p className="muted">{r.boundaryNote}</p>
              </>
            ) : (
              <p className="muted">{r.noBoundary}</p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="bos">
            <h2 id="bos">{r.emptyTitle}</h2>
            <p>{r.emptyLine(c.emptySlots, pct(c.emptySlots, c.slots))}</p>
          </section>

          <section className={styles.section} aria-labelledby="yapi">
            <h2 id="yapi">{r.structureTitle}</h2>
            <div className={ir.columns}>
              <Counts
                title={r.ages}
                rows={Object.entries(report.structure.ages).map(([k, n]) => [
                  v.ageClass[k as keyof typeof v.ageClass],
                  n,
                ])}
                total={c.trees}
              />
              <Counts
                title={r.graft}
                rows={Object.entries(report.structure.graft).map(([k, n]) => [
                  v.graft[k as keyof typeof v.graft],
                  n,
                ])}
                total={c.trees}
              />
              <Counts
                title={r.stem}
                rows={Object.entries(report.structure.stem).map(([k, n]) => [
                  v.stemForm[k as keyof typeof v.stemForm],
                  n,
                ])}
                total={c.trees}
              />
              {report.structure.cultivars.length > 0 && (
                <Counts
                  title={r.cultivars}
                  rows={report.structure.cultivars.map((x) => [x.name, x.trees])}
                  total={c.trees}
                />
              )}
            </div>
            <p className="muted">{r.sexNote}</p>
          </section>

          <section className={styles.section} aria-labelledby="gozlem">
            <h2 id="gozlem">{r.observationsTitle}</h2>
            <Observations report={report} />
            <p className="muted">{r.observationsNote}</p>
          </section>

          <section className={styles.section} aria-labelledby="altyapi">
            <h2 id="altyapi">{r.infrastructureTitle}</h2>
            {report.infrastructure.length > 0 ? (
              <ul>
                {report.infrastructure.map((z) => (
                  <li key={z.kind}>
                    {r.infrastructureLine(
                      r.zoneKinds[z.kind] ?? z.kind,
                      z.count,
                      z.lengthM !== null ? `${formatNumber(z.lengthM)} m` : null,
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{r.infrastructureNone}</p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="guven">
            <h2 id="guven">{r.confidenceTitle}</h2>
            <ul>
              <li>
                {report.confidence.coverage
                  ? r.coverage(
                      formatNumber(report.confidence.coverage.ratio * 100, 0),
                      formatNumber(report.confidence.coverage.threshold * 100, 0),
                    )
                  : r.coverageNone}
              </li>
              {report.confidence.panoramas > 0 && (
                <li>{r.panoramas(report.confidence.panoramas)}</li>
              )}
              {report.confidence.uncertainTrees > 0 && (
                <li>{r.uncertain(report.confidence.uncertainTrees)}</li>
              )}
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="sirada">
            <h2 id="sirada">{r.nextTitle}</h2>
            <p>{r.next}</p>
            <h3>{r.youTitle}</h3>
            <p>{r.you}</p>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={ir.stat}>
      <span className={ir.statValue}>{formatNumber(value)}</span>
      <span className={ir.statLabel}>{label}</span>
    </div>
  );
}

function Counts({
  title,
  rows,
  total,
}: {
  title: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <div>
      <h3>{title}</h3>
      <table className={ir.compactTable}>
        <tbody>
          {rows
            .filter(([, n]) => n > 0)
            .map(([label, n]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{formatNumber(n)}</td>
                <td className="muted">%{pct(n, total)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Observations({ report }: { report: InventoryReport }) {
  const o = report.observations;
  const lines = o
    ? [
        o.deadLooking > 0 && r.observations.deadLooking(o.deadLooking),
        o.dieback > 0 && r.observations.dieback(o.dieback),
        o.denseSprouts > 0 && r.observations.denseSprouts(o.denseSprouts),
        o.trunkDamage > 0 && r.observations.trunkDamage(o.trunkDamage),
      ].filter((x): x is string => !!x)
    : [];
  if (lines.length === 0) return <p>{r.observationsNone}</p>;
  return (
    <ul>
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

// Slots as dots, north up; row numbers at the start of each row.
export function SlotMap({ map }: { map: NonNullable<InventoryReport["map"]> }) {
  const pad = 4;
  const w = map.width + 2 * pad;
  const h = map.height + 2 * pad;
  const rowStarts = new Map<number, MapPoint>();
  for (const p of map.points) {
    const cur = rowStarts.get(p.rowNo);
    if (!cur || p.x < cur.x) rowStarts.set(p.rowNo, p);
  }
  return (
    <figure className={ir.slotMap}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={r.mapTitle} data-testid="inventory-map">
        <rect x={0} y={0} width={w} height={h} fill="var(--color-surface-2, #f3f5ef)" rx={2} />
        {map.points.map((p) => (
          <circle
            key={p.code}
            cx={p.x + pad}
            cy={h - (p.y + pad)}
            r={p.state === "empty" ? 0.9 : 1.3}
            fill={INVENTORY_POINT_COLORS[p.state]}
            stroke={p.state === "empty" ? "#9aa094" : "none"}
            strokeWidth={0.25}
          >
            <title>{`${p.code} · ${r.legend[p.state]}`}</title>
          </circle>
        ))}
        {[...rowStarts.values()].map((p) => (
          <text
            key={p.rowNo}
            x={Math.max(0.5, p.x + pad - 3.2)}
            y={h - (p.y + pad) + 0.9}
            fontSize={2.4}
            fill="#5f6b5f"
          >
            {`S${p.rowNo}`}
          </text>
        ))}
      </svg>
      <figcaption className={ir.legend}>
        {(["tree", "interstitial", "empty", "uncertain"] as const).map((s) => (
          <span key={s}>
            <i style={{ background: INVENTORY_POINT_COLORS[s] }} aria-hidden />
            {r.legend[s]}
          </span>
        ))}
        <span className="muted">{r.mapScale(formatNumber(map.width, 0))}</span>
      </figcaption>
    </figure>
  );
}
