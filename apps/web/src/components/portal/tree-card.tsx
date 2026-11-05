import { categoryLabel, formatDate, formatNumber, t } from "@/lib/i18n";
import type { PhotoItem, TreeCard, TreeMetricHistory } from "@/lib/portal/data";
import { formatPosition } from "@/lib/portal/evidence";
import { SEVERITY_TONES } from "./colors";
import { HashCheck } from "./hash-check";
import { ApprovalBadge, findingKindLabel } from "./labels";
import {
  editQuestionAction,
  askQuestionAction,
  replyQuestionAction,
} from "@/app/portal/parsel/[parcelId]/actions";
import type { QuestionThread } from "@/lib/portal/questions";
import { AskQuestionForm, QuestionNotice, QuestionThreads } from "./question-threads";
import { Badge, ClassBadge, ClassDot } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Facts } from "@/components/ui/facts";
import { IconCamera360 } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table } from "@/components/ui/table";
import layout from "./page.module.css";
import styles from "./parcel.module.css";
import { hasPistachioMethodology } from "@/lib/species";

// Tree card: identity, latest class and who gave it, class and measurement
// history per visit, photos per visit and direction, findings.

const c = t.portal.tree;

export interface QuestionState {
  threads: QuestionThread[];
  sent: boolean;
  error: string | null;
  // A demo visitor: threads without forms.
  demo?: boolean;
  // IP14: a removed garden's reports are read-only (no forms, no notice).
  readOnly?: boolean;
}

export function TreeCardView({ card, questions }: { card: TreeCard; questions: QuestionState }) {
  const { tree, latest } = card;
  const v = t.tree.values;
  const base = `/portal/parsel/${card.parcel.id}`;
  const state = latest?.overallClass ?? "unassessed";
  return (
    <main className={layout.page} data-testid="tree-card">
      <PageHeader
        back={{ href: base, label: card.parcel.name }}
        title={tree.code}
        actions={
          <ButtonLink
            variant="secondary"
            href={`${base}/gezi?agac=${tree.id}`}
            className={styles.noPrint}
          >
            <IconCamera360 size={18} />
            {t.portal.panel.openTour}
          </ButtonLink>
        }
      />

      <div className={styles.treeTop}>
        <Panel title={c.latest} id="durum" className={styles.treeStatus}>
          {latest ? (
            <>
              <div className={styles.classLine}>
                <span className={styles.className} data-testid="tree-class">
                  <ClassDot value={state} />
                  {t.portal.classes[state]}
                </span>
                <ApprovalBadge approval={latest.approval} />
              </div>
              <p className="muted">
                {t.portal.classHelp[state]} {formatDate(latest.visit.time)}
              </p>
            </>
          ) : (
            <p className="muted">{c.noAssessment}</p>
          )}
          {card.classHistory.length > 1 && (
            <ol className={styles.timeline} aria-label={c.timeline} data-testid="class-timeline">
              {[...card.classHistory].reverse().map((entry) => {
                const s = entry.overallClass ?? "unassessed";
                return (
                  <li key={entry.visit.id}>
                    <span
                      className={styles.timelineDot}
                      style={{ "--dot": `var(--class-${s})` } as React.CSSProperties}
                      aria-hidden
                    />
                    <span>{formatDate(entry.visit.time)}</span>
                    <span className="muted">{t.portal.classes[s]}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title={c.identity} id="kimlik">
          <Facts
            rows={[
              [c.code, tree.code],
              [c.slotKind, v.slotKind[tree.slotKind]],
              ...(tree.speciesLabel
                ? ([[t.species.treeSpecies, tree.speciesLabel]] as [string, string][])
                : []),
              // Tree sex: pistachio only (lib/species.ts).
              ...(hasPistachioMethodology(tree.species)
                ? ([[t.portal.panel.sex, v.sex[tree.sex]]] as [string, string][])
                : []),
              [t.portal.panel.graft, v.graft[tree.graft]],
              [t.portal.panel.ageClass, v.ageClass[tree.ageClass]],
              [t.portal.panel.cultivar, tree.cultivar ?? t.tree.unknown],
              [c.inventoryDate, tree.firstSeenAt ? formatDate(tree.firstSeenAt) : t.tree.none],
              ...(tree.status === "lost"
                ? ([[c.lostAt, tree.lostAt ? formatDate(tree.lostAt) : v.status.lost]] as [
                    string,
                    string,
                  ][])
                : []),
            ]}
          />
        </Panel>
      </div>

      <section className={styles.group} aria-labelledby="bulgu-baslik">
        <div className={styles.groupHead}>
          <h2 id="bulgu-baslik">{c.findings}</h2>
        </div>
        {card.findings.length === 0 ? (
          <p className="muted">{c.noFindings}</p>
        ) : (
          <ul className={`${styles.findings} ${styles.treeFindings}`} data-testid="tree-findings">
            {card.findings.map((f) => (
              <li key={f.id}>
                <div className={styles.treeFinding}>
                  <div className={styles.classLine}>
                    <Badge tone={SEVERITY_TONES[f.severity]}>{t.portal.severity[f.severity]}</Badge>
                    <strong>{findingKindLabel(f.kind)}</strong>
                    {f.visitTime && <span className="muted">{formatDate(f.visitTime)}</span>}
                  </div>
                  <p>{f.description}</p>
                  {f.recommendation && (
                    <p className={styles.recommendation}>
                      {t.portal.report.recommendation}: {f.recommendation}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Photos card={card} />

      {card.classHistory.length > 0 && (
        <section className={styles.group} aria-labelledby="gecmis-baslik">
          <div className={styles.groupHead}>
            <h2 id="gecmis-baslik">{c.classHistory}</h2>
          </div>
          <Table data-testid="class-history">
            <thead>
              <tr>
                <th>{c.historyColumns.date}</th>
                <th>{c.historyColumns.class}</th>
                <th>{c.historyColumns.approval}</th>
              </tr>
            </thead>
            <tbody>
              {card.classHistory.map((entry) => {
                const s = entry.overallClass ?? "unassessed";
                return (
                  <tr key={entry.visit.id}>
                    <td className={layout.nowrap}>{formatDate(entry.visit.time)}</td>
                    <td>
                      <ClassBadge value={s}>{t.portal.classes[s]}</ClassBadge>
                    </td>
                    <td>
                      <ApprovalBadge approval={entry.approval} marked={false} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}

      <section className={styles.group} aria-labelledby="olcum-baslik">
        <div className={styles.groupHead}>
          <h2 id="olcum-baslik">{c.measurements}</h2>
        </div>
        {card.metrics.length === 0 ? (
          <p className="muted">{c.noMeasurements}</p>
        ) : (
          <Table data-testid="measurement-history">
            <thead>
              <tr>
                <th>{c.metric}</th>
                {card.visits.map((visit) => (
                  <th key={visit.id}>{formatDate(visit.time)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.metrics.map((m) => (
                <tr key={m.code}>
                  <th scope="row">{m.name}</th>
                  {m.values.map((value, i) => (
                    <td key={card.visits[i].id}>
                      <MetricCell value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section id="sorular" className={styles.group} aria-labelledby="soru-baslik">
        <div className={styles.groupHead}>
          <h2 id="soru-baslik">{t.portal.questions.title}</h2>
          <p className={styles.groupLead}>{t.portal.questions.treeHint}</p>
        </div>
        <QuestionNotice sent={questions.sent} error={questions.error} />
        <div className={styles.stackCard}>
          <QuestionThreads
            threads={questions.threads}
            returnPath={`${base}/agac/${tree.id}`}
            replyAction={replyQuestionAction}
            editAction={editQuestionAction}
            demo={questions.demo}
            readOnly={questions.readOnly}
            compactEmpty
          />
          <AskQuestionForm
            demo={questions.demo}
            readOnly={questions.readOnly}
            parcelId={card.parcel.id}
            treeId={tree.id}
            returnPath={`${base}/agac/${tree.id}`}
            action={askQuestionAction}
            title={t.portal.questions.ask}
            targets={[
              { value: "tree", label: t.portal.questions.targetTree },
              ...card.findings.map((f) => ({
                value: `finding:${f.id}`,
                label: t.portal.questions.targetFinding(
                  findingKindLabel(f.kind),
                  formatDate(f.visitTime),
                ),
              })),
            ]}
          />
        </div>
      </section>
    </main>
  );
}

function MetricCell({ value }: { value: TreeMetricHistory["values"][number] }) {
  if (!value) return <span className="muted">—</span>;
  const source = <span className={`muted ${styles.small}`}> ({c.sources[value.source]})</span>;
  switch (value.type) {
    case "numeric":
      return (
        <>
          {formatNumber(value.value, 1)}
          {value.unit ? ` ${value.unit}` : ""}
          {value.uncertainty !== null && ` ±${formatNumber(value.uncertainty, 1)}`}
          {source}
        </>
      );
    case "scale":
      return (
        <>
          {value.max !== null ? c.scaleOf(value.value, value.max) : value.value}
          {source}
        </>
      );
    case "category":
      return (
        <>
          {categoryLabel(value.value)}
          {source}
        </>
      );
    case "boolean":
      return (
        <>
          {value.value ? c.yes : c.no}
          {source}
        </>
      );
  }
}

function Photos({ card }: { card: TreeCard }) {
  const visits = card.visits.filter((v) => card.photos[v.id]?.length);
  return (
    <section className={styles.group} aria-labelledby="foto-baslik">
      <div className={styles.groupHead}>
        <h2 id="foto-baslik">{c.photos}</h2>
        {visits.length > 0 && <p className={styles.groupLead}>{c.photosHint}</p>}
      </div>
      {visits.length === 0 ? (
        <p className="muted">{c.noPhotos}</p>
      ) : (
        <>
          <div className={styles.photoGrid} data-testid="photo-history">
            {visits.map((visit) => {
              const items = card.photos[visit.id];
              const closeUps = items.filter((p) => p.direction === null);
              return (
                <div key={visit.id} className={styles.photoRow} data-visit-id={visit.id}>
                  <h3>{formatDate(visit.time)}</h3>
                  <div
                    className={styles.photoCells}
                    style={
                      { "--columns": Math.max(2, card.directions.length) } as React.CSSProperties
                    }
                  >
                    {card.directions.map((direction) => {
                      const photo = items.find((p) => p.direction === direction);
                      return (
                        <Photo
                          key={direction}
                          photo={photo ?? null}
                          label={c.directions[direction] ?? direction}
                        />
                      );
                    })}
                  </div>
                  {closeUps.length > 0 && (
                    <div className={styles.photoCells}>
                      {closeUps.map((p) => (
                        <Photo key={p.id} photo={p} label={c.closeUps} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Photo({ photo, label }: { photo: PhotoItem | null; label: string }) {
  return (
    <figure className={styles.photo} data-photo-id={photo?.id}>
      {photo?.url ? (
        // Signed storage URLs: next/image would need every Supabase host configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={label} loading="lazy" />
      ) : (
        <div className={styles.placeholder} role="img" aria-label={`${label}: ${c.photoMissing}`}>
          {c.photoMissing}
        </div>
      )}
      <figcaption>
        <span>{label}</span>
        {photo && <span className={styles.hash}>{c.hash(photo.contentHash.slice(0, 8))}</span>}
        {photo && <Evidence photo={photo} />}
      </figcaption>
    </figure>
  );
}

function Evidence({ photo }: { photo: PhotoItem }) {
  const e = c.evidence;
  return (
    <details className={styles.evidence} data-testid="photo-evidence">
      <summary>{e.title}</summary>
      <dl className={styles.facts}>
        <dt>{e.takenAt}</dt>
        <dd>{photo.visitTime ? formatDate(photo.visitTime) : e.unknown}</dd>
        <dt>{e.position}</dt>
        <dd>{formatPosition(photo.position) ?? e.unknown}</dd>
        <dt>{e.takenBy}</dt>
        <dd>{photo.takenBy ? e.staff(photo.takenBy) : e.unknown}</dd>
        <dt>{e.hash}</dt>
        <dd className={styles.hashFull}>{photo.contentHash}</dd>
      </dl>
      {photo.url && <HashCheck url={photo.url} hash={photo.contentHash} />}
    </details>
  );
}
