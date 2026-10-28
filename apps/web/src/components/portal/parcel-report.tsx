import Link from "next/link";
import { categoryLabel, formatDate, formatNumber, t } from "@/lib/i18n";
import { MARKER_COLORS, type MarkerState } from "@/lib/map/tree-style";
import { CLASS_ORDER, distributionTotal, type Distribution } from "@/lib/portal/classes";
import type { ParcelReport, TreeChange } from "@/lib/portal/data";
import type { FindingItem } from "@/lib/portal/findings";
import type { MetricSummaryRow } from "@/lib/portal/metrics";
import { InventorySummaryView } from "@/components/office/inventory-summary";
import { DemoNotice } from "@/components/demo/demo-notice";
import { demoText } from "@/lib/i18n/messages/demo";
import type { BoundaryCard } from "@/lib/portal/boundary";
import { BoundaryCardView } from "./boundary-card";
import { Dimensions } from "./dimensions";
import { HealthMap, type MapLayer } from "./health-map";
import { DistributionBar, findingKindLabel, percent, ScoreLine } from "./labels";
import { scoreRulesFor, share } from "@/lib/portal/score";
import {
  askQuestionAction,
  editQuestionAction,
  replyQuestionAction,
} from "@/app/portal/parsel/[parcelId]/actions";
import type { QuestionState } from "./tree-card";
import { AskQuestionForm, QuestionNotice, QuestionThreads } from "./question-threads";
import { SEVERITY_COLORS } from "./colors";
import { PrintButton } from "./print-button";
import type { ParcelViewers } from "@/lib/portal/viewers";
import { ViewersCard } from "./viewers-card";
import styles from "./portal.module.css";

// Parcel report card: latest published visit, change since the previous one,
// health map, findings, card metrics and visit history.

const r = t.portal.report;

export function ParcelReportView({
  report,
  classFilter,
  findingId,
  mapOptions,
  boundaryCard,
  questions,
  viewers,
  demo = false,
  pdfLimit = false,
}: {
  report: ParcelReport;
  classFilter?: MarkerState[];
  findingId?: string;
  // ?ziyaret=, ?degisen=1, ?katman=isi|kapsama
  mapOptions?: { visitId?: string; changed?: boolean; layers?: MapLayer[] };
  boundaryCard?: BoundaryCard | null;
  questions?: QuestionState;
  // Co-owners, for the parcel's owner only.
  viewers?: { data: ParcelViewers; outcome?: string };
  // A demo visitor: the same report, its forms replaced by a notice.
  demo?: boolean;
  // A demo session over its PDF cap was sent back here.
  pdfLimit?: boolean;
}) {
  const base = `/portal/parsel/${report.parcel.id}`;
  return (
    <main className={styles.page}>
      <p className={styles.noPrint}>
        <Link href="/portal">← {r.back}</Link>
      </p>
      <div className={styles.titleRow}>
        <div>
          <h1>{report.parcel.name}</h1>
          <p className="muted">
            {report.boundary
              ? t.parcel.boundaryVersion(report.boundary.version)
              : t.parcel.noBoundary}
            {" · "}
            {t.parcel.slotCount(report.slotCount, report.activeTreeCount)}
          </p>
        </div>
        <div className={`${styles.actions} ${styles.noPrint}`}>
          <Link className="button" href={`${base}/gezi`}>
            {r.tour}
          </Link>
          {report.latest && (
            <a className="button" href={`${base}/rapor.pdf`} data-testid="report-pdf">
              {r.pdf}
            </a>
          )}
          {boundaryCard?.inventory && (
            <Link className="button button-secondary" href={`${base}/envanter`}>
              {r.inventoryReport}
            </Link>
          )}
          <PrintButton />
        </div>
      </div>
      {pdfLimit && <DemoNotice text={demoText.closed.pdfLimit} />}

      {boundaryCard && (
        <BoundaryCardView parcelId={report.parcel.id} card={boundaryCard} demo={demo} />
      )}
      {boundaryCard?.inventory && (
        <div data-testid="portal-inventory">
          <InventorySummaryView
            summary={boundaryCard.inventory.summary}
            title={
              boundaryCard.inventory.approvedAt
                ? `${t.inventory.portal.inventoryTitle} · ${t.inventory.portal.inventoryApproved(formatDate(boundaryCard.inventory.approvedAt))}`
                : t.inventory.portal.inventoryTitle
            }
          />
        </div>
      )}

      {report.latest ? (
        <>
          <Summary report={report} base={base} />
          <Dimensions report={report} base={base} />
        </>
      ) : (
        <p className={styles.notice} data-testid="no-results">
          {r.noResults}
        </p>
      )}

      <section id="harita" className={styles.section} aria-labelledby="harita-baslik">
        <h2 id="harita-baslik">{r.mapTitle}</h2>
        <HealthMap
          key={`${classFilter?.join(",") ?? "all"}|${mapOptions?.layers?.join(",") ?? ""}|${mapOptions?.visitId ?? ""}|${mapOptions?.changed ?? ""}`}
          parcelId={report.parcel.id}
          boundary={report.boundary?.geometry ?? null}
          slots={report.slots}
          findings={report.findings}
          bounds={report.bounds}
          initialStates={classFilter}
          initialFindingId={findingId}
          visits={report.mapVisits}
          coverage={report.coverage}
          initialVisitId={mapOptions?.visitId}
          initialChanged={mapOptions?.changed}
          initialLayers={mapOptions?.layers}
        />
      </section>

      {report.latest && (
        <>
          <Findings findings={report.findings} base={base} />
          <Metrics metrics={report.metrics} />
        </>
      )}
      {questions && <Questions report={report} base={base} questions={questions} />}
      <History report={report} />
      {viewers?.data.isOwner && (
        <ViewersCard
          parcelId={report.parcel.id}
          viewers={viewers.data}
          outcome={viewers.outcome}
          demo={demo}
        />
      )}
    </main>
  );
}

function Summary({ report, base }: { report: ParcelReport; base: string }) {
  const latest = report.latest!;
  const total = distributionTotal(latest.distribution);
  const states: (keyof Distribution)[] = [...CLASS_ORDER, "unassessed"];
  return (
    <section className={styles.section} aria-labelledby="karne-baslik" data-testid="report-summary">
      <div>
        <h2 id="karne-baslik">{r.summaryTitle}</h2>
        <p className="muted">
          {r.visitOf(formatDate(latest.time))}
          {latest.methodologyVersion && ` · ${r.methodology(latest.methodologyVersion)}`}
        </p>
      </div>
      <div className={styles.scoreBox} data-testid="score-box">
        <ScoreLine
          score={latest.score}
          change={report.scoreChange}
          basis={report.scoreBasis}
          unassessedPct={report.scoreUnassessedPct}
          size="large"
        />
        <p className={`muted ${styles.small}`}>
          {t.portal.score.help}. {t.portal.score.weights(scoreRulesFor(latest.methodologyVersion))}
        </p>
      </div>
      <p>
        <strong data-testid="tree-count">{r.treeCount(report.activeTreeCount)}</strong>
        {" · "}
        {r.assessedCount(latest.assessedCount, report.activeTreeCount)}
      </p>
      {report.audit && <Audit audit={report.audit} />}
      <DistributionBar distribution={latest.distribution} />
      <ul className={styles.tiles}>
        {states
          .filter((c) => c !== "unassessed" || latest.distribution.unassessed > 0)
          .map((c) => (
            <li key={c}>
              <Link
                className={styles.tile}
                href={`${base}?sinif=${c}#harita`}
                data-testid={`count-${c}`}
                title={`${r.showOnMap}: ${t.portal.classes[c]}`}
              >
                <span className={styles.tileLabel}>
                  <span className={styles.swatch} style={{ background: MARKER_COLORS[c] }} />
                  {t.portal.classes[c]}
                </span>
                <span className={styles.tileValue}>{formatNumber(latest.distribution[c])}</span>
                <span className={`muted ${styles.small}`}>
                  {r.percent(percent(latest.distribution[c], total))} · {t.portal.classHelp[c]}
                </span>
              </Link>
            </li>
          ))}
      </ul>
      <Change report={report} base={base} />
    </section>
  );
}

function Audit({ audit }: { audit: NonNullable<ParcelReport["audit"]> }) {
  const a = t.portal.audit;
  const pct = (n: number) => String(share(n, audit.activeTrees) ?? 0);
  return (
    <div className={styles.audit} data-testid="audit">
      <h3>{a.title}</h3>
      <ul className={styles.plainList}>
        <li data-testid="audit-coverage">
          {a.coverage(pct(audit.covered), audit.covered, audit.activeTrees)}
        </li>
        <li data-testid="audit-expert">
          {a.expert(pct(audit.expertReviewed), audit.expertReviewed)}
        </li>
        {audit.autoApproved > 0 && <li className="muted">{a.auto}</li>}
        <li data-testid="audit-methodology">
          {audit.methodologyVersion ? a.methodology(audit.methodologyVersion) : a.noMethodology}
        </li>
      </ul>
    </div>
  );
}

const SHOWN_CHANGES = 10;
// The rest of the findings sit behind "show more"; all of them print.
const SHOWN_FINDINGS = 8;

function Change({ report, base }: { report: ParcelReport; base: string }) {
  if (!report.previous || !report.change) {
    return <p className="muted">{r.changeFirst}</p>;
  }
  const { worse, better } = report.change;
  return (
    <div data-testid="report-change">
      <h3>{r.changeTitle}</h3>
      <p className="muted">{r.changeIntro(formatDate(report.previous.time))}</p>
      {worse.length === 0 && better.length === 0 ? (
        <p>{r.unchanged}</p>
      ) : (
        <div className={styles.changeGrid}>
          <ChangeList
            title={r.worse(worse.length)}
            className={styles.worse}
            items={worse}
            base={base}
          />
          <ChangeList
            title={r.better(better.length)}
            className={styles.better}
            items={better}
            base={base}
          />
        </div>
      )}
    </div>
  );
}

function ChangeList({
  title,
  className,
  items,
  base,
}: {
  title: string;
  className: string;
  items: TreeChange[];
  base: string;
}) {
  return (
    <div>
      <h3 className={className}>{title}</h3>
      <ul className={styles.plainList}>
        {items.slice(0, SHOWN_CHANGES).map((c) => (
          <li key={c.treeId}>
            <Link href={`${base}/agac/${c.treeId}`}>{c.code}</Link>{" "}
            <span className="muted">
              {r.changeLine(t.portal.classes[c.from], t.portal.classes[c.to])}
            </span>
          </li>
        ))}
        {items.length > SHOWN_CHANGES && (
          <li className="muted">{r.moreTrees(items.length - SHOWN_CHANGES)}</li>
        )}
      </ul>
    </div>
  );
}

function Findings({ findings, base }: { findings: FindingItem[]; base: string }) {
  return (
    <section className={styles.section} aria-labelledby="bulgu-baslik">
      <h2 id="bulgu-baslik">{r.findingsTitle}</h2>
      {findings.length === 0 ? (
        <p className="muted">{r.findingsEmpty}</p>
      ) : (
        <div className={styles.more} data-testid="findings">
          <FindingList findings={findings.slice(0, SHOWN_FINDINGS)} base={base} />
          {findings.length > SHOWN_FINDINGS && (
            <details className={styles.more}>
              <summary>{r.moreFindings(findings.length - SHOWN_FINDINGS)}</summary>
              <FindingList findings={findings.slice(SHOWN_FINDINGS)} base={base} />
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function FindingList({ findings, base }: { findings: FindingItem[]; base: string }) {
  return (
    <ul className={styles.findings}>
      {findings.map((f) => {
        const href = f.treeId
          ? `${base}/agac/${f.treeId}`
          : f.point
            ? `${base}?bulgu=${f.id}#harita`
            : null;
        const body = (
          <div
            className={styles.finding}
            style={{ "--severity": SEVERITY_COLORS[f.severity] } as React.CSSProperties}
          >
            <div className={styles.findingHead}>
              <strong style={{ color: SEVERITY_COLORS[f.severity] }}>
                {t.portal.severity[f.severity]}
              </strong>
              <span>{findingKindLabel(f.kind)}</span>
              <span className="muted">{f.treeCode ?? r.parcelLevel}</span>
            </div>
            <span>{f.description}</span>
            {f.recommendation && (
              <span>
                <strong>{r.recommendation}: </strong>
                {f.recommendation}
              </span>
            )}
          </div>
        );
        return (
          <li key={f.id} data-finding-id={f.id}>
            {href ? (
              <Link className={styles.findingLink} href={href}>
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Metrics({ metrics }: { metrics: MetricSummaryRow[] }) {
  return (
    <section className={styles.section} aria-labelledby="olcum-baslik">
      <h2 id="olcum-baslik">{r.metricsTitle}</h2>
      {metrics.length === 0 ? (
        <p className="muted">{r.metricsEmpty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="metrics">
            <tbody>
              {metrics.map((m) => (
                <tr key={m.code}>
                  <th scope="row">{m.name}</th>
                  <td>{r.metricCount(m.count)}</td>
                  <td>
                    <MetricSummaryText metric={m} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MetricSummaryText({ metric }: { metric: MetricSummaryRow }) {
  const s = metric.summary;
  switch (s.type) {
    case "numeric": {
      const unit = s.unit ? ` ${s.unit}` : "";
      return (
        <>
          {r.metricMean(
            formatNumber(s.mean, 1) + unit,
            formatNumber(s.min, 1) + unit,
            formatNumber(s.max, 1) + unit,
          )}
        </>
      );
    }
    case "scale":
    case "category":
      return (
        <>
          {s.counts
            .filter((c) => c.count > 0)
            .map(
              (c) =>
                `${s.type === "category" ? categoryLabel(String(c.value)) : c.value}: ${c.count}`,
            )
            .join(" · ")}
        </>
      );
    case "boolean":
      return <>{r.metricYesNo(s.yes, s.no)}</>;
  }
}

// Every question of the parcel; new questions here only on parcel-level
// findings (tree questions are asked on the tree card).
function Questions({
  report,
  base,
  questions,
}: {
  report: ParcelReport;
  base: string;
  questions: QuestionState;
}) {
  const q = t.portal.questions;
  return (
    <section id="sorular" className={styles.section} aria-labelledby="soru-baslik">
      <h2 id="soru-baslik">{q.title}</h2>
      <p className="muted">{q.parcelHint}</p>
      <QuestionNotice sent={questions.sent} error={questions.error} />
      <QuestionThreads
        threads={questions.threads}
        returnPath={base}
        replyAction={replyQuestionAction}
        editAction={editQuestionAction}
        treeHref={(thread) => (thread.treeId ? `${base}/agac/${thread.treeId}` : null)}
        demo={questions.demo}
      />
      <AskQuestionForm
        demo={questions.demo}
        parcelId={report.parcel.id}
        treeId={null}
        returnPath={base}
        action={askQuestionAction}
        title={q.askParcel}
        targets={report.findings
          .filter((f) => !f.treeId)
          .map((f) => ({
            value: `finding:${f.id}`,
            label: `${findingKindLabel(f.kind)}: ${f.description.slice(0, 60)}`,
          }))}
      />
    </section>
  );
}

function History({ report }: { report: ParcelReport }) {
  const c = r.columns;
  return (
    <section className={styles.section} aria-labelledby="gecmis-baslik">
      <h2 id="gecmis-baslik">{r.historyTitle}</h2>
      {report.visits.length === 0 ? (
        <p className="muted">{r.historyEmpty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="visit-history">
            <thead>
              <tr>
                <th>{c.date}</th>
                <th>{c.kind}</th>
                <th className={styles.number}>{c.assessed}</th>
                <th className={styles.number}>{c.findings}</th>
                <th>{c.methodology}</th>
              </tr>
            </thead>
            <tbody>
              {report.visits.map((v) => (
                <tr key={v.id} data-visit-id={v.id}>
                  <td>{formatDate(v.time)}</td>
                  <td>{t.portal.sessionKind[v.kind]}</td>
                  <td className={styles.number}>{formatNumber(v.assessedCount)}</td>
                  <td className={styles.number}>{formatNumber(v.findingCount)}</td>
                  <td>{v.methodologyVersion ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
