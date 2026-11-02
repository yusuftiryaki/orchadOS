import Link from "next/link";
import { categoryLabel, formatDate, formatNumber, t } from "@/lib/i18n";
import { servicesText as S } from "@/lib/i18n/messages/services";
import type { ParcelReport } from "@/lib/portal/data";
import { share } from "@/lib/portal/score";
import { longDate } from "@/lib/services/format";
import { Panel } from "@/components/ui/panel";
import layout from "./page.module.css";
import styles from "./parcel.module.css";
import { hasPistachioMethodology } from "@/lib/species";

// "Boyut boyut" rows of the report card (docs/MVP.md Module 5, parsel
// karnesi): inventory, orchard structure, health, spatial pattern, care,
// pests, fruit load, audit confidence (with the coverage and expert shares of
// report.audit). Rows that have a map view link to the health map with the
// matching layer.

const d = t.portal.dimensions;

export function Dimensions({ report, base }: { report: ParcelReport; base: string }) {
  const dims = report.dimensions;
  const latest = report.latest;
  if (!dims || !latest) return null;
  const { inventory, structure, care, pests, fruitLoad, pattern } = dims;
  const coverage = report.coverage[latest.id];
  const pct = (n: number, total: number) => String(share(n, total) ?? 0);
  const audit = report.audit;
  const a = t.portal.audit;
  const pistachio = hasPistachioMethodology(report.parcel.species);

  return (
    <Panel title={d.title} headingLevel={3} testId="dimensions">
      <ul className={`${layout.rows} ${styles.dimensions}`}>
        <Row label={d.inventory} id="inventory">
          <p>
            {d.inventoryLine(
              inventory.slots,
              inventory.trees,
              inventory.emptySlots,
              inventory.interstitial,
            )}
          </p>
          {inventory.lost === null || inventory.added === null ? (
            <p className="muted">{d.firstVisit}</p>
          ) : inventory.lost.length === 0 && inventory.added.length === 0 ? (
            <p className="muted">{d.noChange}</p>
          ) : (
            <>
              {inventory.lost.length > 0 && (
                <p data-testid="dimension-lost">{d.lost(inventory.lost.join(", "))}</p>
              )}
              {inventory.added.length > 0 && (
                <p data-testid="dimension-added">{d.added(inventory.added.join(", "))}</p>
              )}
            </>
          )}
        </Row>
        <Row label={d.structure} id="structure">
          {/* Sex and the male/female ratio: pistachio only (lib/species.ts). */}
          {pistachio && (
            <p data-testid="structure-sex">
              {d.sexLine(structure.female, structure.male, structure.unknownSex)}
              {structure.femalesPerMale !== null && structure.ratioAdvice && (
                <>
                  {"; "}
                  <strong>{d.ratio(formatNumber(structure.femalesPerMale, 1))}</strong>,{" "}
                  {d.ratioAdvice[structure.ratioAdvice]}
                </>
              )}
            </p>
          )}
          {pistachio && structure.femalesPerMale === null && (
            <p className="muted">{d.ratioUnknown}</p>
          )}
          <p>
            {d.ungrafted(structure.ungrafted)}; {d.ages.toLocaleLowerCase("tr")}:{" "}
            {(Object.keys(structure.ages) as (keyof typeof structure.ages)[])
              .filter((a) => structure.ages[a] > 0)
              .map((a) => `${t.tree.values.ageClass[a]} ${structure.ages[a]}`)
              .join(", ")}
          </p>
        </Row>
        <Row label={d.health} id="health" href={`${base}#harita`}>
          <p className="muted">{d.healthLine}</p>
        </Row>
        <Row label={d.pattern} id="pattern" href={`${base}?katman=isi#harita`}>
          {pattern.issues === 0 ? (
            <p className="muted">{d.noIssues}</p>
          ) : (
            <>
              <p>{d.patternLine(pattern.issues, pattern.halfOfIssuesIn, pattern.cells)}</p>
              {pattern.hotCells > 0 && <p>{d.hotCells(pattern.hotCells)}</p>}
            </>
          )}
        </Row>
        <Row label={d.care} id="care">
          {care.pruning && (
            <p>
              {d.pruning(
                pct(care.pruning.done, care.pruning.total),
                care.pruning.done,
                care.pruning.partial,
                care.pruning.notDone,
              )}
            </p>
          )}
          {care.harvest && (
            <p>
              {d.harvest(
                pct(care.harvest.complete, care.harvest.total),
                care.harvest.complete,
                care.harvest.total,
              )}
            </p>
          )}
          {care.sprouts && (
            <p>{d.sprouts(care.sprouts.dense, care.sprouts.few, care.sprouts.total)}</p>
          )}
          {care.weedHeight && (
            <p data-testid="care-weed-height">
              {S.care.weedHeight(S.weedHeight[care.weedHeight])}{" "}
              <span className={`${layout.muted} ${layout.small}`}>({S.care.weedHelp})</span>
            </p>
          )}
          {!care.pruning && !care.harvest && !care.sprouts && !care.weedHeight && (
            <p className="muted">{d.careNone}</p>
          )}
          {care.ownWork.length > 0 && (
            <p className={styles.ownWork} data-testid="care-own-work">
              <strong>{S.care.ownWork(care.ownWork.map(longDate).join(", "))}</strong>
            </p>
          )}
        </Row>
        <Row label={d.pests} id="pests">
          {pests ? (
            <>
              <p>{d.pestLine(pests.mild, pests.marked, pests.assessed)}</p>
              {Object.keys(pests.types).length > 0 && (
                <p>
                  {d.pestTypes(
                    Object.entries(pests.types)
                      .map(([type, n]) => `${categoryLabel(type)} ${n}`)
                      .join(", "),
                  )}
                </p>
              )}
              {pests.rows.length > 0 && (
                <p>{d.pestRows(pests.rows.map((r) => `S${r}`).join(", "))}</p>
              )}
            </>
          ) : (
            <p className="muted">{d.pestsNone}</p>
          )}
        </Row>
        <Row label={d.fruit} id="fruit">
          {fruitLoad ? (
            <>
              <p>
                {d.fruitLine(
                  fruitLoad.counts.map((n, v) => `${v}: ${n}`).join(", "),
                  formatNumber(fruitLoad.mean, 1),
                )}
              </p>
              {fruitLoad.previousYear && fruitLoad.trend && (
                <p>
                  {d.fruitTrend[fruitLoad.trend](
                    formatNumber(fruitLoad.previousYear.mean, 1),
                    formatDate(fruitLoad.previousYear.time),
                  )}
                  {pistachio && fruitLoad.trend === "lower" && ` ${d.fruitLowerPistachio}`}
                </p>
              )}
            </>
          ) : (
            <p className="muted">{d.fruitNone}</p>
          )}
        </Row>
        <Row
          label={d.audit}
          id="audit"
          href={`${base}?katman=kapsama#harita`}
          linkLabel={d.coverageLink}
        >
          {audit && (
            <div className={styles.auditLines} data-testid="audit">
              <p data-testid="audit-coverage">
                {a.coverage(
                  pct(audit.covered, audit.activeTrees),
                  audit.covered,
                  audit.activeTrees,
                )}
              </p>
              <p data-testid="audit-expert">
                {a.expert(pct(audit.expertReviewed, audit.activeTrees), audit.expertReviewed)}
              </p>
              {audit.autoApproved > 0 && <p>{a.auto}</p>}
              <p data-testid="audit-methodology">
                {audit.methodologyVersion
                  ? a.methodology(audit.methodologyVersion)
                  : a.noMethodology}
              </p>
            </div>
          )}
          <p>{d.auditLine(coverage?.panoramas ?? 0, coverage?.closeUps ?? 0)}</p>
          {latest.publishedAt && <p>{d.signed(formatDate(latest.publishedAt))}</p>}
        </Row>
      </ul>
    </Panel>
  );
}

function Row({
  label,
  id,
  href,
  linkLabel,
  children,
}: {
  label: string;
  id: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <li data-dimension={id}>
      <h4>{label}</h4>
      <div className={styles.dimensionBody}>{children}</div>
      {href && (
        <Link className={`${styles.noPrint} ${styles.small}`} href={href}>
          {linkLabel ?? d.showOnMap}
        </Link>
      )}
    </li>
  );
}
