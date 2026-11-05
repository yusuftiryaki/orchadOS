import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge, ClassDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, panelClass } from "@/components/ui/panel";
import { cell, Table } from "@/components/ui/table";
import { ClassPlate } from "@/components/ui/class-plate";
import { categoryLabel, formatDate, formatNumber, t } from "@/lib/i18n";
import type { MarkerState } from "@/lib/map/tree-style";
import { CLASS_ORDER, distributionTotal, type Distribution } from "@/lib/portal/classes";
import { approverLine } from "@/lib/portal/approver";
import type { ParcelReport, TreeChange } from "@/lib/portal/data";
import { SEVERITY_ORDER, type FindingItem, type Severity } from "@/lib/portal/findings";
import type { MetricSummaryRow } from "@/lib/portal/metrics";
import { InventorySummaryView } from "@/components/office/inventory-summary";
import { DemoNotice } from "@/components/demo/demo-notice";
import { demoText } from "@/lib/i18n/messages/demo";
import { portalBillingText } from "@/lib/i18n/messages/portal-billing";
import type { BoundaryCard } from "@/lib/portal/boundary";
import { BoundaryCardView } from "./boundary-card";
import { BoundaryNotice } from "./boundary-notice";
import { Dimensions } from "./dimensions";
import { HealthMap, type MapLayer } from "./health-map";
import { findingKindLabel, percent, ScoreLine } from "./labels";
import { scoreRulesFor } from "@/lib/portal/score";
import {
  askQuestionAction,
  editQuestionAction,
  replyQuestionAction,
} from "@/app/portal/parsel/[parcelId]/actions";
import type { QuestionState } from "./tree-card";
import { AskQuestionForm, QuestionNotice, QuestionThreads } from "./question-threads";
import { SEVERITY_TONES } from "./colors";
import { PrintButton } from "./print-button";
import { SectionNav, type SectionNavItem } from "./section-nav";
import { IconCamera360, IconDownload } from "@/components/ui/icons";
import type { ParcelViewers } from "@/lib/portal/viewers";
import { ViewersCard } from "./viewers-card";
import layout from "./page.module.css";
import styles from "./parcel.module.css";
import { speciesName } from "@/lib/species";

// The garden's report card, built to answer "how is my garden and what needs
// my attention" on a phone: the state of the latest published visit, what
// needs attention, the health map, then the findings, the report card
// details, the boundary, the service, the visits, questions and co-owners.

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
  serviceCard = null,
  serviceOffers = null,
  upcomingVisits = null,
  removedUntil = null,
}: {
  report: ParcelReport;
  classFilter?: MarkerState[];
  findingId?: string;
  // ?ziyaret=, ?degisen=1, ?katman=isi|kapsama
  mapOptions?: { visitId?: string; changed?: boolean; layers?: MapLayer[] };
  boundaryCard?: BoundaryCard | null;
  questions?: QuestionState;
  // Co-owners, for the parcel's owner only.
  viewers?: { data: ParcelViewers; outcome?: string; readOnly?: boolean };
  // A demo visitor: the same report, its forms replaced by a notice.
  demo?: boolean;
  // A demo session over its PDF cap was sent back here.
  pdfLimit?: boolean;
  // IP14: the paying owner's "Hizmet" card, and the last day the reports of
  // a removed garden stay open (a band for everyone).
  serviceCard?: ReactNode;
  // IP15: the owner's service cards (weed mowing): recommendation, offer,
  // pre-request or the open request.
  serviceOffers?: ReactNode;
  // T07: the owner's planned visits.
  upcomingVisits?: ReactNode;
  removedUntil?: string | null;
}) {
  const base = `/portal/parsel/${report.parcel.id}`;
  const latest = report.latest;
  // A garden without trees or boundary yet has nothing to draw.
  const hasMap = report.slots.features.length > 0 || report.boundary !== null;
  // H07, T16: the long boundary notice once per report: on the boundary card
  // while the boundary waits for the owner's approval (where it is decided),
  // otherwise at the foot of the health map.
  const noticeOnCard = !!boundaryCard?.latest && !boundaryCard.latest.approvedAt;
  const showViewers = viewers?.data.isOwner === true;
  const showQuestions =
    !!questions &&
    (latest !== null || questions.threads.length > 0 || !!questions.readOnly || !!questions.demo);
  // The boundary sits in the report card group once there is a report;
  // before the first visit it is a section of its own.
  const boundaryOwn = !!boundaryCard && !latest;
  const nav: SectionNavItem[] = [
    ...(latest ? [{ href: "#ozet", label: r.nav.summary }] : []),
    ...(hasMap ? [{ href: "#harita", label: r.nav.map }] : []),
    ...(latest
      ? [
          { href: "#bulgular", label: r.nav.findings },
          { href: "#karne", label: r.nav.details },
        ]
      : []),
    ...(boundaryOwn ? [{ href: "#sinir", label: r.nav.boundary }] : []),
    { href: "#ziyaretler", label: r.nav.visits },
    ...(showQuestions ? [{ href: "#sorular", label: r.nav.questions }] : []),
    ...(showViewers ? [{ href: "#hissedarlar", label: r.nav.viewers }] : []),
  ];

  const boundary = boundaryCard && (
    <div className={styles.boundaryGroup}>
      <BoundaryCardView
        parcelId={report.parcel.id}
        card={boundaryCard}
        demo={demo}
        notice={noticeOnCard}
      />
      {boundaryCard.inventory && (
        <div className={`${panelClass} ${styles.inventoryPanel}`} data-testid="portal-inventory">
          <InventorySummaryView
            summary={boundaryCard.inventory.summary}
            title={
              boundaryCard.inventory.approvedAt
                ? `${t.inventory.portal.inventoryTitle}, ${t.inventory.portal.inventoryApproved(formatDate(boundaryCard.inventory.approvedAt))}`
                : t.inventory.portal.inventoryTitle
            }
          />
          <div className={`${layout.actions} ${styles.noPrint}`}>
            <ButtonLink variant="secondary" href={`${base}/envanter`}>
              {r.inventoryReport}
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <main className={`${layout.page} ${styles.report}`}>
      <PageHeader
        back={{ href: "/portal", label: r.back }}
        title={report.parcel.name}
        lead={placeOf(report) ?? undefined}
        meta={
          <ul className={styles.metaList}>
            <li data-testid="parcel-species">
              {t.species.label}: {speciesName(report.parcel.species)}
            </li>
            <li>
              {report.boundary
                ? t.parcel.boundaryVersion(report.boundary.version)
                : t.parcel.noBoundary}
            </li>
            <li data-testid="parcel-inventory">
              {t.parcel.slotCount(report.slotCount, report.activeTreeCount)}
            </li>
          </ul>
        }
        actions={
          (report.visits.length > 0 || latest) && (
            <>
              {report.visits.length > 0 && (
                <ButtonLink variant="secondary" href={`${base}/gezi`} className={styles.noPrint}>
                  <IconCamera360 size={18} />
                  {r.tour}
                </ButtonLink>
              )}
              {latest && (
                <a
                  className={`button button-secondary ${styles.noPrint}`}
                  href={`${base}/rapor.pdf`}
                  data-testid="report-pdf"
                >
                  <IconDownload size={18} />
                  {r.pdf}
                </a>
              )}
              {latest && <PrintButton className={`${styles.printButton} ${styles.noPrint}`} />}
            </>
          )
        }
      />
      {pdfLimit && <DemoNotice text={demoText.closed.pdfLimit} />}
      {removedUntil && (
        <Alert tone="info" role="status" testId="removed-band">
          <p>{portalBillingText.removal.removedBand(formatDate(removedUntil))}</p>
        </Alert>
      )}

      {nav.length > 2 && <SectionNav items={nav} label={r.onThisPage} />}

      {latest ? (
        <section id="ozet" className={styles.group} aria-label={r.nav.summary}>
          <div className={styles.hero}>
            <Summary report={report} base={base} />
            <Attention report={report} base={base} boundaryCard={boundaryCard ?? null} />
          </div>
          <Change report={report} base={base} />
        </section>
      ) : (
        <EmptyState title={r.noResultsTitle} testId="no-results">
          <p>{r.noResultsNext}</p>
        </EmptyState>
      )}

      {hasMap && (
        <section id="harita" className={styles.group} aria-labelledby="harita-baslik">
          <div className={styles.groupHead}>
            <h2 id="harita-baslik">{r.mapTitle}</h2>
          </div>
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
            footer={!noticeOnCard ? <BoundaryNotice /> : null}
          />
        </section>
      )}

      {latest && (
        <>
          <Findings findings={report.findings} base={base} />
          <section id="karne" className={styles.group} aria-labelledby="karne-baslik">
            <div className={styles.groupHead}>
              <h2 id="karne-baslik">{r.detailsTitle}</h2>
            </div>
            <Dimensions report={report} base={base} />
            <Metrics metrics={report.metrics} />
            {boundary && (
              <div id="sinir" className={styles.anchor}>
                {boundary}
              </div>
            )}
          </section>
        </>
      )}

      {boundaryOwn && (
        <section id="sinir" className={styles.group} aria-labelledby="sinir-baslik">
          <div className={styles.groupHead}>
            <h2 id="sinir-baslik">{r.boundaryTitle}</h2>
          </div>
          {boundary}
        </section>
      )}

      <div id="ziyaretler" className={styles.group}>
        <section className={styles.group} aria-labelledby="ziyaret-baslik">
          <div className={styles.groupHead}>
            <h2 id="ziyaret-baslik">{r.visitsTitle}</h2>
          </div>
          {upcomingVisits}
          <History report={report} titled={!!upcomingVisits} />
        </section>
        {serviceCard}
        {serviceOffers && <div className={styles.offers}>{serviceOffers}</div>}
      </div>

      {showQuestions && <Questions report={report} base={base} questions={questions!} />}
      {showViewers && (
        <ViewersCard
          parcelId={report.parcel.id}
          viewers={viewers!.data}
          outcome={viewers!.outcome}
          demo={demo}
          readOnly={viewers!.readOnly}
        />
      )}
    </main>
  );
}

function placeOf(report: ParcelReport): string | null {
  const { village, district, province } = report.parcel;
  const place = [village, district, province].filter(Boolean).join(", ");
  return place || null;
}

// The hero of the report, the garden as one object: its class plate (the
// garden from above), the latest visit's date and approver, the score and
// how the trees split over the classes (each count opens the map filtered
// to that class).
function Summary({ report, base }: { report: ParcelReport; base: string }) {
  const latest = report.latest!;
  const total = distributionTotal(latest.distribution);
  const states: (keyof Distribution)[] = [...CLASS_ORDER, "unassessed"];
  const shown = states.filter((c) => c !== "unassessed" || latest.distribution.unassessed > 0);
  return (
    <section className={styles.summary} aria-labelledby="durum-baslik" data-testid="report-summary">
      <ClassPlate
        counts={latest.distribution}
        size="var(--summary-plate)"
        className={styles.summaryPlate}
      />
      <div className={styles.summaryHead}>
        <h2 id="durum-baslik">{r.summaryTitle}</h2>
        <p className={styles.summaryDate}>{r.visitOf(formatDate(latest.time))}</p>
        {(latest.methodologyVersion || report.approver) && (
          <p className={styles.summaryMeta}>
            {report.approver && (
              <span data-testid="report-approver">{approverLine(report.approver)}</span>
            )}
            {latest.methodologyVersion && <span>{r.methodology(latest.methodologyVersion)}</span>}
          </p>
        )}
      </div>
      <div className={styles.scoreBox} data-testid="score-box">
        <ScoreLine
          score={latest.score}
          change={report.scoreChange}
          basis={report.scoreBasis}
          unassessedPct={report.scoreUnassessedPct}
          size="large"
        />
      </div>
      <p className={styles.treeLine}>
        <strong data-testid="tree-count">{r.treeCount(report.activeTreeCount)}</strong>
        <span className="muted">
          {r.assessedCount(latest.assessedCount, report.activeTreeCount)}
        </span>
      </p>
      <ul className={styles.counts}>
        {shown.map((c) => (
          <li key={c}>
            <Link
              className={styles.count}
              href={`${base}?sinif=${c}#harita`}
              data-testid={`count-${c}`}
              title={`${r.showOnMap}: ${t.portal.classes[c]}`}
            >
              <span className={styles.countName}>
                <ClassDot value={c} />
                {t.portal.classes[c]}
              </span>
              <span className={styles.countFigures}>
                <span className={styles.countValue}>{formatNumber(latest.distribution[c])}</span>{" "}
                <span className={styles.countShare}>
                  {r.percent(percent(latest.distribution[c], total))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className={`${styles.summaryHelp} ${styles.noPrint}`}>
        <details className={styles.disclosure}>
          <summary>{r.scoreHelpTitle}</summary>
          <p className={styles.small}>
            {t.portal.score.help}.{" "}
            {t.portal.score.weights(scoreRulesFor(latest.methodologyVersion))}
          </p>
        </details>
        <details className={styles.disclosure}>
          <summary>{r.classHelpTitle}</summary>
          <dl className={styles.classHelp}>
            {shown.map((c) => (
              <ClassHelpRow key={c} state={c} />
            ))}
          </dl>
        </details>
      </div>
      {!report.change && <p className={styles.summaryNote}>{r.changeFirst}</p>}
    </section>
  );
}

function ClassHelpRow({ state }: { state: keyof Distribution }) {
  return (
    <>
      <dt>
        <ClassDot value={state} />
        {t.portal.classes[state]}
      </dt>
      <dd>{t.portal.classHelp[state]}</dd>
    </>
  );
}

const SHOWN_CHANGES = 10;
// Per kind of finding; the rest sit behind "show more" and all of them print.
const SHOWN_FINDINGS = 5;
const SHOWN_CODE_CHIPS = 12;
// Tree codes named per kind in "Dikkat isteyenler".
const SHOWN_CODES = 4;

function Change({ report, base }: { report: ParcelReport; base: string }) {
  if (!report.previous || !report.change) return null;
  const { worse, better } = report.change;
  return (
    <section className={styles.change} data-testid="report-change" aria-labelledby="degisim-baslik">
      <div className={styles.changeHead}>
        <h3 id="degisim-baslik">{r.changeTitle}</h3>
        <p className="muted">{r.changeIntro(formatDate(report.previous.time))}</p>
      </div>
      {worse.length === 0 && better.length === 0 ? (
        <p>{r.unchanged}</p>
      ) : (
        <div className={styles.changeGrid}>
          <ChangeList title={r.worse(worse.length)} tone={styles.worse} items={worse} base={base} />
          <ChangeList
            title={r.better(better.length)}
            tone={styles.better}
            items={better}
            base={base}
          />
        </div>
      )}
    </section>
  );
}

function ChangeList({
  title,
  tone,
  items,
  base,
}: {
  title: string;
  tone: string;
  items: TreeChange[];
  base: string;
}) {
  return (
    <div>
      <h4 className={tone}>{title}</h4>
      <ul className={styles.changeList}>
        {items.slice(0, SHOWN_CHANGES).map((c) => (
          <li key={c.treeId}>
            <Link className={styles.treeChip} href={`${base}/agac/${c.treeId}`}>
              {c.code}
            </Link>{" "}
            <span className={styles.changeLine}>
              <ClassDot value={c.to} />
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

interface KindGroup {
  kind: string;
  items: FindingItem[];
}

// Findings of one severity, grouped by kind in the order they come (most
// severe first, then as the report sorts them).
function byKind(findings: FindingItem[]): KindGroup[] {
  const groups = new Map<string, FindingItem[]>();
  for (const f of findings) {
    const list = groups.get(f.kind);
    if (list) list.push(f);
    else groups.set(f.kind, [f]);
  }
  return [...groups].map(([kind, items]) => ({ kind, items }));
}

function bySeverity(findings: FindingItem[]): [Severity, FindingItem[]][] {
  return SEVERITY_ORDER.map(
    (s) => [s, findings.filter((f) => f.severity === s)] as [Severity, FindingItem[]],
  ).filter(([, items]) => items.length > 0);
}

// "Dikkat isteyenler": urgent and important findings by kind with the first
// tree codes, trees that got worse, and a boundary waiting for approval.
function Attention({
  report,
  base,
  boundaryCard,
}: {
  report: ParcelReport;
  base: string;
  boundaryCard: BoundaryCard | null;
}) {
  const pressing = report.findings.filter((f) => f.severity === "high" || f.severity === "medium");
  const high = pressing.filter((f) => f.severity === "high").length;
  const worse = report.change?.worse.length ?? 0;
  const boundaryPending =
    !!boundaryCard?.latest && !boundaryCard.latest.approvedAt && boundaryCard.canApprove;
  if (pressing.length === 0 && worse === 0 && !boundaryPending) {
    return (
      <Panel title={r.calmTitle} id="dikkat" className={`${styles.attention} ${styles.calm}`}>
        <p className="muted">{r.calmBody}</p>
      </Panel>
    );
  }
  // The map filtered to the classes of the trees with these findings.
  const stateOf = new Map(
    report.slots.features
      .filter((f) => f.properties.tree)
      .map((f) => [f.properties.tree!.id, f.properties.state]),
  );
  const states = [
    ...new Set(pressing.flatMap((f) => (f.treeId ? [stateOf.get(f.treeId)] : []))),
  ].filter((s): s is MarkerState => !!s);
  return (
    <Panel
      title={r.attentionTitle}
      description={pressing.length > 0 ? r.findingSummary(high, pressing.length - high) : undefined}
      id="dikkat"
      className={styles.attention}
    >
      {pressing.length > 0 && (
        <ul className={styles.attentionList}>
          {bySeverity(pressing).flatMap(([severity, items]) =>
            byKind(items).map(({ kind, items: group }) => {
              const trees = group.filter((f) => f.treeId);
              return (
                <li key={`${severity}:${kind}`}>
                  <span className={styles.attentionItem}>
                    <Badge tone={SEVERITY_TONES[severity]}>{t.portal.severity[severity]}</Badge>
                    <strong>{findingKindLabel(kind)}</strong>
                    <span className="muted">{r.kindTrees(group.length)}</span>
                  </span>
                  {trees.length > 0 && (
                    <CodeList
                      findings={trees.slice(0, SHOWN_CODES)}
                      base={base}
                      ids={false}
                      compact
                    >
                      {trees.length > SHOWN_CODES && (
                        <li className={styles.codeMore}>
                          {r.moreCodes(trees.length - SHOWN_CODES)}
                        </li>
                      )}
                    </CodeList>
                  )}
                </li>
              );
            }),
          )}
        </ul>
      )}
      {(worse > 0 || boundaryPending) && (
        <ul className={styles.attentionNotes}>
          {worse > 0 && (
            <li>
              {r.worseSince(worse)} <Link href={`${base}?degisen=1#harita`}>{r.showChanged}</Link>
            </li>
          )}
          {boundaryPending && (
            <li>
              {r.boundaryPending} <a href="#sinir">{r.boundaryReview}</a>
            </li>
          )}
        </ul>
      )}
      {pressing.length > 0 && (
        <div className={`${styles.attentionActions} ${styles.noPrint}`}>
          <ButtonLink
            href={states.length > 0 ? `${base}?sinif=${states.join(",")}#harita` : `${base}#harita`}
          >
            {r.showOnMapFiltered}
          </ButtonLink>
          <ButtonLink variant="quiet" href="#bulgular">
            {r.allFindings}
          </ButtonLink>
        </div>
      )}
    </Panel>
  );
}

function Findings({ findings, base }: { findings: FindingItem[]; base: string }) {
  return (
    <section id="bulgular" className={styles.group} aria-labelledby="bulgu-baslik">
      <div className={styles.groupHead}>
        <h2 id="bulgu-baslik">{r.findingsTitle}</h2>
        {findings.length > 0 && <p className={styles.groupLead}>{r.findingsLead}</p>}
      </div>
      {findings.length === 0 ? (
        <p className="muted">{r.findingsEmpty}</p>
      ) : (
        <div className={styles.findingGroups} data-testid="findings">
          {bySeverity(findings).map(([severity, items]) => (
            <div key={severity} className={styles.findingGroup}>
              <h3>
                <Badge tone={SEVERITY_TONES[severity]}>{t.portal.severity[severity]}</Badge>
                <span className={styles.findingCount}>{formatNumber(items.length)}</span>
              </h3>
              {byKind(items).map((group) => (
                <KindFindings key={group.kind} group={group} base={base} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function KindFindings({ group, base }: { group: KindGroup; base: string }) {
  const { items } = group;
  // One recommendation for the kind when every finding has the same one.
  const shared =
    items.length > 1 && items.every((f) => f.recommendation === items[0].recommendation)
      ? items[0].recommendation
      : null;
  // Tree findings with one and the same text show as a list of codes.
  const sameText =
    items.length > 1 &&
    items.every((f) => f.treeId && f.treeCode && withoutCode(f) === withoutCode(items[0]));
  const List = sameText ? CodeList : FindingList;
  // A short remainder is shown rather than folded.
  const limit = sameText ? SHOWN_CODE_CHIPS : SHOWN_FINDINGS;
  const shown = items.length <= limit + 3 ? items.length : limit;
  return (
    <div className={styles.findingKind}>
      <div className={styles.findingKindHead}>
        <p className={styles.findingKindTitle}>
          <strong>{findingKindLabel(group.kind)}</strong>{" "}
          <span className="muted">({formatNumber(items.length)})</span>
        </p>
        {sameText && <p>{withoutCode(items[0])}</p>}
        {shared && (
          <p className={styles.recommendation}>
            {r.recommendation}: {shared}
          </p>
        )}
      </div>
      <List findings={items.slice(0, shown)} base={base} shared={!!shared} />
      {items.length > shown && (
        <details className={styles.more}>
          <summary>{r.moreInGroup(items.length - shown)}</summary>
          <List findings={items.slice(shown)} base={base} shared={!!shared} />
        </details>
      )}
    </div>
  );
}

// Tree findings that say the same thing, or the trees of a kind in "Dikkat
// isteyenler": one line of tree code chips (44px targets), each opening the
// tree card. `children` adds a last item ("ve 3 ağaç daha").
function CodeList({
  findings,
  base,
  ids = true,
  compact = false,
  children,
}: {
  findings: FindingItem[];
  base: string;
  shared?: boolean;
  // Smaller chips in the "Dikkat isteyenler" card.
  compact?: boolean;
  // The findings list marks its items; the summary above it does not repeat
  // the marks.
  ids?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <ul className={compact ? `${styles.codeList} ${styles.codeListCompact}` : styles.codeList}>
      {findings.map((f) => (
        <li key={f.id} data-finding-id={ids ? f.id : undefined}>
          <Link className={styles.codeChip} href={`${base}/agac/${f.treeId}`}>
            {f.treeCode}
          </Link>
        </li>
      ))}
      {children}
    </ul>
  );
}

// "S1-6: ağaç kurumuş görünüyor." reads "ağaç kurumuş görünüyor." next to
// the code.
function withoutCode(f: FindingItem): string {
  const prefix = f.treeCode ? `${f.treeCode}: ` : null;
  const text =
    prefix && f.description.startsWith(prefix) ? f.description.slice(prefix.length) : f.description;
  return text.charAt(0).toLocaleUpperCase("tr") + text.slice(1);
}

function FindingList({
  findings,
  base,
  shared,
}: {
  findings: FindingItem[];
  base: string;
  shared: boolean;
}) {
  return (
    <ul className={styles.findings}>
      {findings.map((f) => {
        const href = f.treeId
          ? `${base}/agac/${f.treeId}`
          : f.point
            ? `${base}?bulgu=${f.id}#harita`
            : null;
        const body = (
          <>
            <span className={styles.findingWhere}>{f.treeCode ?? r.parcelLevel}</span>
            <span className={styles.findingText}>
              <span>{withoutCode(f)}</span>
              {f.recommendation && !shared && (
                <span className={styles.findingRecommendation}>
                  {r.recommendation}: {f.recommendation}
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={f.id} data-finding-id={f.id}>
            {href ? (
              <Link className={styles.finding} href={href}>
                {body}
              </Link>
            ) : (
              <div className={styles.finding}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Metrics({ metrics }: { metrics: MetricSummaryRow[] }) {
  return (
    <div className={styles.subsection}>
      <h3>{r.metricsTitle}</h3>
      {metrics.length === 0 ? (
        <p className="muted">{r.metricsEmpty}</p>
      ) : (
        <Table data-testid="metrics">
          <thead>
            <tr>
              <th>{r.metricColumns.metric}</th>
              <th className={cell.num}>{r.metricColumns.count}</th>
              <th>{r.metricColumns.summary}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.code}>
                <th scope="row">{m.name}</th>
                <td className={cell.num}>{formatNumber(m.count)}</td>
                <td>
                  <MetricSummaryText metric={m} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
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
            .join(", ")}
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
    <section id="sorular" className={styles.group} aria-labelledby="soru-baslik">
      <div className={styles.groupHead}>
        <h2 id="soru-baslik">{q.title}</h2>
        <p className={styles.groupLead}>{q.parcelHint}</p>
      </div>
      <QuestionNotice sent={questions.sent} error={questions.error} />
      <div className={styles.stackCard}>
        <QuestionThreads
          threads={questions.threads}
          returnPath={base}
          replyAction={replyQuestionAction}
          editAction={editQuestionAction}
          treeHref={(thread) => (thread.treeId ? `${base}/agac/${thread.treeId}` : null)}
          demo={questions.demo}
          readOnly={questions.readOnly}
          compactEmpty
        />
        <AskQuestionForm
          demo={questions.demo}
          readOnly={questions.readOnly}
          parcelId={report.parcel.id}
          treeId={null}
          returnPath={base}
          action={askQuestionAction}
          title={q.askParcel}
          secondary
          targets={report.findings
            .filter((f) => !f.treeId)
            .map((f) => ({
              value: `finding:${f.id}`,
              label: `${findingKindLabel(f.kind)}: ${shorten(f.description, 60)}`,
            }))}
        />
      </div>
    </section>
  );
}

// At most `max` characters, cut at a word.
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).replace(/[;,.:]$/, "")}…`;
}

function History({ report, titled }: { report: ParcelReport; titled: boolean }) {
  const c = r.columns;
  if (report.visits.length === 0) return <p className="muted">{r.historyEmpty}</p>;
  return (
    <div className={styles.subsection}>
      {titled && <h3>{r.historyTitle}</h3>}
      <Table data-testid="visit-history" className={styles.history}>
        <thead>
          <tr>
            <th>{c.date}</th>
            <th>{c.kind}</th>
            <th className={cell.num}>{c.assessed}</th>
            <th className={cell.num}>{c.findings}</th>
            <th className={styles.wide}>{c.methodology}</th>
          </tr>
        </thead>
        <tbody>
          {report.visits.map((v) => (
            <tr key={v.id} data-visit-id={v.id}>
              <td className={layout.nowrap}>{formatDate(v.time)}</td>
              <td>{t.portal.sessionKind[v.kind]}</td>
              <td className={cell.num}>{formatNumber(v.assessedCount)}</td>
              <td className={cell.num}>{formatNumber(v.findingCount)}</td>
              <td className={`${layout.nowrap} ${styles.wide}`}>{v.methodologyVersion ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
