import "server-only";
import { Circle, Document, Page, Rect, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { categoryLabel, formatDate, formatNumber, t } from "@/lib/i18n";
import { MARKER_COLORS, type MarkerState } from "@/lib/map/tree-style";
import { LocalFrame } from "@/lib/office/local-frame";
import { CLASS_ORDER, distributionTotal, type Distribution } from "@/lib/portal/classes";
import { approverLine } from "@/lib/portal/approver";
import type { ParcelReport } from "@/lib/portal/data";
import type { CareDimension } from "@/lib/portal/dimensions";
import type { MetricSummaryRow } from "@/lib/portal/metrics";
import { scoreRulesFor, share } from "@/lib/portal/score";
import { servicesText } from "@/lib/i18n/messages/services";
import { longDate } from "@/lib/services/format";
import { BoundaryFooter, Bullets, Footer, Header, SampleWatermark, sampleInfo } from "./parts";
import { COLORS, pdf, registerFonts } from "./theme";

// The owner's report card of the latest published visit as a PDF: summary,
// class distribution, change, health map, findings, dimensions, metrics. Same
// texts as the portal page (components/portal/parcel-report.tsx).

const r = t.portal.report;
const SEVERITY: Record<string, string> = {
  high: "#c92a2a",
  medium: "#e8590c",
  low: "#f59f00",
  info: "#1c7ed6",
};
const pct = (n: number, total: number) => (total > 0 ? formatNumber((100 * n) / total, 0) : "0");

export interface PdfOptions {
  // A demo visitor's sample: watermark and sample marker (docs/demo-turu.md §11.6).
  demo?: boolean;
}

export async function reportPdf(
  report: ParcelReport,
  now = new Date(),
  options: PdfOptions = {},
): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument report={report} now={now} demo={options.demo} />);
}

export function ReportDocument({
  report,
  now,
  demo = false,
}: {
  report: ParcelReport;
  now: Date;
  demo?: boolean;
}) {
  const latest = report.latest!;
  const total = distributionTotal(latest.distribution);
  const states: (keyof Distribution)[] = [...CLASS_ORDER, "unassessed"];
  const sc = t.portal.score;
  const subtitle = [
    r.visitOf(formatDate(latest.time)),
    latest.methodologyVersion ? r.methodology(latest.methodologyVersion) : null,
    report.approver ? approverLine(report.approver) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Document
      title={`${r.summaryTitle} · ${report.parcel.name}`}
      author="orchadOS"
      language="tr"
      {...sampleInfo(demo)}
    >
      <Page size="A4" style={pdf.reportPage}>
        {demo && <SampleWatermark />}
        <Header kicker={r.pdfKicker} title={report.parcel.name} subtitle={subtitle} />

        <View style={pdf.section} wrap={false}>
          <View style={pdf.statRow}>
            <View style={[pdf.stat, { backgroundColor: COLORS.accentSoft }]}>
              <Text style={pdf.statLabel}>{sc.label}</Text>
              <Text style={pdf.statValue}>
                {latest.score == null ? "—" : `${formatNumber(latest.score)} ${sc.outOf}`}
              </Text>
              <Text style={pdf.statLabel}>
                {report.scoreChange == null
                  ? report.scoreBasis === "no_same_season"
                    ? sc.noSameSeason
                    : sc.first
                  : (report.scoreChange === 0
                      ? sc.change.same
                      : report.scoreChange > 0
                        ? sc.change.up(report.scoreChange)
                        : sc.change.down(-report.scoreChange)) +
                    (report.scoreBasis === "same_season" ? ` · ${sc.sameSeasonNote}` : "")}
              </Text>
              {report.scoreUnassessedPct != null && (
                <Text style={pdf.statLabel}>{sc.unassessed(report.scoreUnassessedPct)}</Text>
              )}
            </View>
            <View style={pdf.stat}>
              <Text style={pdf.statLabel}>{r.treeCount(report.activeTreeCount)}</Text>
              <Text style={pdf.statValue}>{formatNumber(latest.assessedCount)}</Text>
              <Text style={pdf.statLabel}>
                {r.assessedCount(latest.assessedCount, report.activeTreeCount)}
              </Text>
            </View>
          </View>
          <Text
            style={pdf.muted}
          >{`${sc.help}. ${sc.weights(scoreRulesFor(latest.methodologyVersion))}`}</Text>

          <DistributionBarPdf distribution={latest.distribution} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
            {states
              .filter((c) => c !== "unassessed" || latest.distribution.unassessed > 0)
              .map((c) => (
                <View key={c} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      backgroundColor: MARKER_COLORS[c],
                    }}
                  />
                  <Text>
                    {`${t.portal.classes[c]}: ${formatNumber(latest.distribution[c])} (%${pct(latest.distribution[c], total)})`}
                  </Text>
                </View>
              ))}
          </View>
        </View>

        {report.audit && (
          <View style={pdf.section}>
            <Text style={pdf.h2}>{t.portal.audit.title}</Text>
            <Bullets
              items={[
                t.portal.audit.coverage(
                  String(share(report.audit.covered, report.audit.activeTrees) ?? 0),
                  report.audit.covered,
                  report.audit.activeTrees,
                ),
                t.portal.audit.expert(
                  String(share(report.audit.expertReviewed, report.audit.activeTrees) ?? 0),
                  report.audit.expertReviewed,
                ),
                report.audit.methodologyVersion
                  ? t.portal.audit.methodology(report.audit.methodologyVersion)
                  : t.portal.audit.noMethodology,
              ]}
            />
          </View>
        )}

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.changeTitle}</Text>
          {!report.previous || !report.change ? (
            <Text style={pdf.muted}>{r.changeFirst}</Text>
          ) : report.change.worse.length === 0 && report.change.better.length === 0 ? (
            <Text>{r.unchanged}</Text>
          ) : (
            <>
              <Text style={pdf.muted}>{r.changeIntro(formatDate(report.previous.time))}</Text>
              <View style={pdf.columns}>
                {(
                  [
                    [r.worse(report.change.worse.length), report.change.worse],
                    [r.better(report.change.better.length), report.change.better],
                  ] as const
                ).map(([title, items]) => (
                  <View key={title} style={pdf.column}>
                    <Text style={pdf.h3}>{title}</Text>
                    {items.slice(0, 20).map((c) => (
                      <Text key={c.treeId}>
                        {`${c.code}  ${r.changeLine(t.portal.classes[c.from], t.portal.classes[c.to])}`}
                      </Text>
                    ))}
                    {items.length > 20 && (
                      <Text style={pdf.muted}>{r.moreTrees(items.length - 20)}</Text>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <HealthMapPdf report={report} />

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.findingsTitle}</Text>
          {report.findings.length === 0 ? (
            <Text style={pdf.muted}>{r.findingsEmpty}</Text>
          ) : (
            report.findings.map((f) => (
              <View
                key={f.id}
                wrap={false}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: SEVERITY[f.severity] ?? COLORS.border,
                  paddingLeft: 8,
                  marginBottom: 6,
                }}
              >
                <Text>
                  <Text style={{ fontWeight: 700, color: SEVERITY[f.severity] }}>
                    {t.portal.severity[f.severity]}
                  </Text>
                  {`  ${t.portal.findingKinds[f.kind] ?? f.kind.replaceAll("_", " ")}  ·  ${f.treeCode ?? r.parcelLevel}`}
                </Text>
                <Text>{f.description}</Text>
                {f.recommendation && (
                  <Text>
                    <Text style={{ fontWeight: 700 }}>{`${r.recommendation}: `}</Text>
                    {f.recommendation}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {report.dimensions && <CarePdf care={report.dimensions.care} />}

        {report.metrics.length > 0 && (
          <View style={pdf.section}>
            <Text style={pdf.h2}>{r.metricsTitle}</Text>
            {report.metrics.map((m) => (
              <View key={m.code} style={pdf.row} wrap={false}>
                <Text style={{ width: "30%", fontWeight: 700 }}>{m.name}</Text>
                <Text style={{ width: "15%" }}>{r.metricCount(m.count)}</Text>
                <Text style={{ width: "55%", textAlign: "right" }}>{metricText(m)}</Text>
              </View>
            ))}
          </View>
        )}

        <BoundaryFooter />
        <Footer left={`${t.inventoryReport.generated(formatDate(now.toISOString()))}`} />
      </Page>
    </Document>
  );
}

// "Bakım uyumu" as on the card (components/portal/dimensions.tsx), with the
// weed height and, when orchadOS mowed in the window before the visit, the
// independence note (docs/MVP.md Module 6, "Bağımsızlık").
function CarePdf({ care }: { care: CareDimension }) {
  const d = t.portal.dimensions;
  const lines = [
    care.pruning &&
      d.pruning(
        pct(care.pruning.done, care.pruning.total),
        care.pruning.done,
        care.pruning.partial,
        care.pruning.notDone,
      ),
    care.harvest &&
      d.harvest(
        pct(care.harvest.complete, care.harvest.total),
        care.harvest.complete,
        care.harvest.total,
      ),
    care.sprouts && d.sprouts(care.sprouts.dense, care.sprouts.few, care.sprouts.total),
    care.weedHeight &&
      `${servicesText.care.weedHeight(servicesText.weedHeight[care.weedHeight])} (${servicesText.care.weedHelp})`,
  ].filter((line): line is string => typeof line === "string");
  return (
    <View style={pdf.section} wrap={false}>
      <Text style={pdf.h2}>{d.care}</Text>
      {lines.length > 0 ? <Bullets items={lines} /> : <Text style={pdf.muted}>{d.careNone}</Text>}
      {care.ownWork.length > 0 && (
        <Text
          style={{
            marginTop: 4,
            paddingLeft: 8,
            borderLeftWidth: 3,
            borderLeftColor: COLORS.accent,
            fontWeight: 700,
          }}
        >
          {servicesText.care.ownWork(care.ownWork.map(longDate).join(", "))}
        </Text>
      )}
    </View>
  );
}

function metricText(metric: MetricSummaryRow): string {
  const s = metric.summary;
  switch (s.type) {
    case "numeric": {
      const unit = s.unit ? ` ${s.unit}` : "";
      return r.metricMean(
        formatNumber(s.mean, 1) + unit,
        formatNumber(s.min, 1) + unit,
        formatNumber(s.max, 1) + unit,
      );
    }
    case "scale":
    case "category":
      return s.counts
        .filter((c) => c.count > 0)
        .map(
          (c) => `${s.type === "category" ? categoryLabel(String(c.value)) : c.value}: ${c.count}`,
        )
        .join(" · ");
    case "boolean":
      return r.metricYesNo(s.yes, s.no);
  }
}

const BAR_WIDTH = 515;

function DistributionBarPdf({ distribution }: { distribution: Distribution }) {
  const total = distributionTotal(distribution);
  if (total === 0) return null;
  const order: (keyof Distribution)[] = [...CLASS_ORDER, "unassessed"];
  let x = 0;
  return (
    <Svg width={BAR_WIDTH} height={14} style={{ marginTop: 8 }}>
      {order.map((c) => {
        const w = (BAR_WIDTH * distribution[c]) / total;
        const rect = <Rect key={c} x={x} y={0} width={w} height={14} fill={MARKER_COLORS[c]} />;
        x += w;
        return rect;
      })}
    </Svg>
  );
}

function HealthMapPdf({ report }: { report: ParcelReport }) {
  const pts = report.slots.features.filter((f) => f.geometry?.coordinates);
  if (pts.length === 0) return null;
  const lat0 = pts.reduce((a, f) => a + f.geometry.coordinates[1], 0) / pts.length;
  const lon0 = pts.reduce((a, f) => a + f.geometry.coordinates[0], 0) / pts.length;
  const frame = new LocalFrame(lat0, lon0);
  const local = pts.map((f) => ({
    state: f.properties.state as MarkerState,
    v: frame.toLocal({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }),
  }));
  const minX = Math.min(...local.map((p) => p.v.x));
  const maxX = Math.max(...local.map((p) => p.v.x));
  const minY = Math.min(...local.map((p) => p.v.y));
  const maxY = Math.max(...local.map((p) => p.v.y));
  const pad = 4;
  const w = Math.max(1, maxX - minX) + 2 * pad;
  const h = Math.max(1, maxY - minY) + 2 * pad;
  const height = Math.min(420, (BAR_WIDTH * h) / w);
  return (
    <View style={pdf.section} wrap={false}>
      <Text style={pdf.h2}>{r.mapTitle}</Text>
      <Svg width={BAR_WIDTH} height={height} viewBox={`0 0 ${w} ${h}`}>
        <Rect x={0} y={0} width={w} height={h} fill="#f3f5ef" />
        {local.map((p, i) => (
          <Circle
            key={i}
            cx={p.v.x - minX + pad}
            cy={h - (p.v.y - minY + pad)}
            r={p.state === "empty" ? 0.8 : 1.3}
            fill={MARKER_COLORS[p.state]}
            stroke={p.state === "empty" ? "#9aa094" : "none"}
            strokeWidth={0.25}
          />
        ))}
      </Svg>
    </View>
  );
}
