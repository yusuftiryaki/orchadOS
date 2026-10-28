import "server-only";
import { Circle, Document, Page, Rect, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { approverLine } from "@/lib/portal/approver";
import { INVENTORY_POINT_COLORS, type InventoryReport } from "@/lib/portal/inventory-report";
import { BoundaryFooter, Bullets, Footer, Header, SampleWatermark, sampleInfo } from "./parts";
import type { PdfOptions } from "./report-pdf";
import { pdf, registerFonts } from "./theme";

// The owner's inventory report as a PDF: the same sections and texts as the
// portal page (components/portal/inventory-report.tsx).

const r = t.inventoryReport;
const v = t.tree.values;
const pct = (n: number, total: number) => (total > 0 ? formatNumber((n / total) * 100, 0) : "0");
const signedPct = (share: number) => `${share > 0 ? "+" : ""}%${formatNumber(share * 100, 0)}`;
const area = (m2: number) => `${formatNumber(m2 / 1000, 1)} dönüm (${formatNumber(m2, 0)} m²)`;

export async function inventoryPdf(
  report: InventoryReport,
  now = new Date(),
  options: PdfOptions = {},
): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<InventoryDocument report={report} now={now} demo={options.demo} />);
}

export function InventoryDocument({
  report,
  now,
  demo = false,
}: {
  report: InventoryReport;
  now: Date;
  demo?: boolean;
}) {
  const c = report.counts;
  const subtitle = [
    report.parcel.place,
    report.inventory?.date ? r.subtitle(formatDate(report.inventory.date)) : null,
    report.inventory?.approvedAt ? r.approvedOn(formatDate(report.inventory.approvedAt)) : null,
    report.inventory?.approver ? approverLine(report.inventory.approver) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const o = report.observations;
  const observations = o
    ? [
        o.deadLooking > 0 && r.observations.deadLooking(o.deadLooking),
        o.dieback > 0 && r.observations.dieback(o.dieback),
        o.denseSprouts > 0 && r.observations.denseSprouts(o.denseSprouts),
        o.trunkDamage > 0 && r.observations.trunkDamage(o.trunkDamage),
      ].filter((x): x is string => !!x)
    : [];
  return (
    <Document
      title={`${r.title} · ${report.parcel.name}`}
      author="orchadOS"
      language="tr"
      {...sampleInfo(demo)}
    >
      <Page size="A4" style={pdf.reportPage}>
        {demo && <SampleWatermark />}
        <Header kicker={r.title} title={report.parcel.name} subtitle={subtitle} />
        {report.warnings.includes("boundary_unapproved") && (
          <View style={pdf.notice}>
            <Text>{r.draft}</Text>
          </View>
        )}

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.summaryTitle}</Text>
          <Text style={pdf.p}>
            {r.summary(c.slots, c.trees, c.emptySlots, c.interstitialTrees)}
            {report.estimate
              ? ` ${r.estimateLine(report.estimate.declared, signedPct(report.estimate.share))}`
              : ""}
          </Text>
          <View style={pdf.statRow}>
            {(
              [
                [r.legend.slots, c.slots],
                [r.legend.tree, c.rowTrees],
                [r.legend.interstitial, c.interstitialTrees],
                [r.legend.empty, c.emptySlots],
              ] as const
            ).map(([label, n]) => (
              <View key={label} style={pdf.stat}>
                <Text style={pdf.statValue}>{formatNumber(n)}</Text>
                <Text style={pdf.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={pdf.muted}>{r.terms}</Text>
          <Text style={pdf.muted}>{r.disclaimer}</Text>
        </View>

        {report.warnings.length > 0 && (
          <View style={pdf.section}>
            <Text style={pdf.h2}>{r.warningsTitle}</Text>
            <Bullets items={report.warnings.map((w) => r.warnings[w])} />
          </View>
        )}

        {report.map && (
          <View style={pdf.section} wrap={false}>
            <Text style={pdf.h2}>{r.mapTitle}</Text>
            <Text style={pdf.muted}>{r.mapHint}</Text>
            <SlotMapPdf map={report.map} />
          </View>
        )}

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.boundaryTitle}</Text>
          {report.boundary ? (
            <>
              {report.boundary.areaM2 !== null && (
                <Text style={pdf.p}>{r.boundaryArea(area(report.boundary.areaM2))}</Text>
              )}
              {report.area && (
                <Text style={pdf.p}>
                  {r.boundaryDeclared(area(report.area.declaredM2), signedPct(report.area.share))}
                </Text>
              )}
              {report.boundary.approvedAt ? (
                <Text style={pdf.p}>
                  {r.boundaryApproved(formatDate(report.boundary.approvedAt))}
                </Text>
              ) : report.boundary.fieldSurvey ? (
                <Text style={pdf.p}>{r.boundaryAwaiting}</Text>
              ) : null}
            </>
          ) : (
            <Text style={pdf.muted}>{r.noBoundary}</Text>
          )}
        </View>

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.emptyTitle}</Text>
          <Text>{r.emptyLine(c.emptySlots, pct(c.emptySlots, c.slots))}</Text>
        </View>

        <View style={pdf.section} wrap={false}>
          <Text style={pdf.h2}>{r.structureTitle}</Text>
          <View style={pdf.columns}>
            <CountTable
              title={r.ages}
              rows={Object.entries(report.structure.ages).map(([k, n]) => [
                v.ageClass[k as keyof typeof v.ageClass],
                n,
              ])}
              total={c.trees}
            />
            <CountTable
              title={r.graft}
              rows={Object.entries(report.structure.graft).map(([k, n]) => [
                v.graft[k as keyof typeof v.graft],
                n,
              ])}
              total={c.trees}
            />
            <CountTable
              title={r.stem}
              rows={Object.entries(report.structure.stem).map(([k, n]) => [
                v.stemForm[k as keyof typeof v.stemForm],
                n,
              ])}
              total={c.trees}
            />
          </View>
          {report.structure.cultivars.length > 0 && (
            <Text style={[pdf.p, { marginTop: 6 }]}>
              {`${r.cultivars}: ${report.structure.cultivars.map((x) => `${x.name} (${x.trees})`).join(", ")}`}
            </Text>
          )}
          <Text style={pdf.muted}>{r.sexNote}</Text>
        </View>

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.observationsTitle}</Text>
          {observations.length > 0 ? (
            <Bullets items={observations} />
          ) : (
            <Text>{r.observationsNone}</Text>
          )}
          <Text style={pdf.muted}>{r.observationsNote}</Text>
        </View>

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.infrastructureTitle}</Text>
          {report.infrastructure.length > 0 ? (
            <Bullets
              items={report.infrastructure.map((z) =>
                r.infrastructureLine(
                  r.zoneKinds[z.kind] ?? z.kind,
                  z.count,
                  z.lengthM !== null ? `${formatNumber(z.lengthM)} m` : null,
                ),
              )}
            />
          ) : (
            <Text style={pdf.muted}>{r.infrastructureNone}</Text>
          )}
        </View>

        <View style={pdf.section}>
          <Text style={pdf.h2}>{r.confidenceTitle}</Text>
          <Bullets
            items={[
              report.confidence.coverage
                ? r.coverage(
                    formatNumber(report.confidence.coverage.ratio * 100, 0),
                    formatNumber(report.confidence.coverage.threshold * 100, 0),
                  )
                : r.coverageNone,
              ...(report.confidence.panoramas > 0
                ? [r.panoramas(report.confidence.panoramas)]
                : []),
              ...(report.confidence.uncertainTrees > 0
                ? [r.uncertain(report.confidence.uncertainTrees)]
                : []),
            ]}
          />
        </View>

        <View style={pdf.section} wrap={false}>
          <Text style={pdf.h2}>{r.nextTitle}</Text>
          <Text style={pdf.p}>{r.next}</Text>
          <Text style={pdf.h3}>{r.youTitle}</Text>
          <Text style={pdf.p}>{r.you}</Text>
        </View>

        <BoundaryFooter />
        <Footer left={r.generated(formatDate(now.toISOString()))} />
      </Page>
    </Document>
  );
}

function CountTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <View style={pdf.column}>
      <Text style={pdf.h3}>{title}</Text>
      {rows
        .filter(([, n]) => n > 0)
        .map(([label, n]) => (
          <View key={label} style={pdf.row}>
            <Text>{label}</Text>
            <Text>{`${formatNumber(n)} · %${pct(n, total)}`}</Text>
          </View>
        ))}
    </View>
  );
}

const MAP_WIDTH = 515;

function SlotMapPdf({ map }: { map: NonNullable<InventoryReport["map"]> }) {
  const pad = 4;
  const w = map.width + 2 * pad;
  const h = map.height + 2 * pad;
  const height = Math.min(420, (MAP_WIDTH * h) / w);
  return (
    <View style={{ marginTop: 6 }}>
      <Svg width={MAP_WIDTH} height={height} viewBox={`0 0 ${w} ${h}`}>
        <Rect x={0} y={0} width={w} height={h} fill="#f3f5ef" />
        {map.points.map((p) => (
          <Circle
            key={p.code}
            cx={p.x + pad}
            cy={h - (p.y + pad)}
            r={p.state === "empty" ? 0.9 : 1.3}
            fill={INVENTORY_POINT_COLORS[p.state]}
          />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
        {(["tree", "interstitial", "empty", "uncertain"] as const).map((s) => (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: INVENTORY_POINT_COLORS[s],
              }}
            />
            <Text style={pdf.muted}>{r.legend[s]}</Text>
          </View>
        ))}
        <Text style={pdf.muted}>{r.mapScale(formatNumber(map.width, 0))}</Text>
      </View>
    </View>
  );
}
