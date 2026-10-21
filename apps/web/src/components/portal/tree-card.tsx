import Link from "next/link";
import { categoryLabel, formatDate, formatNumber, t } from "@/lib/i18n";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import type { PhotoItem, TreeCard, TreeMetricHistory } from "@/lib/portal/data";
import { SEVERITY_COLORS } from "./colors";
import { ApprovalBadge, findingKindLabel } from "./labels";
import {
  editQuestionAction,
  askQuestionAction,
  replyQuestionAction,
} from "@/app/portal/parsel/[parcelId]/actions";
import type { QuestionThread } from "@/lib/portal/questions";
import { AskQuestionForm, QuestionNotice, QuestionThreads } from "./question-threads";
import styles from "./portal.module.css";

// Tree card: identity, latest class and who gave it, class and measurement
// history per visit, photos per visit and direction, findings.

const c = t.portal.tree;

export interface QuestionState {
  threads: QuestionThread[];
  sent: boolean;
  error: string | null;
}

export function TreeCardView({ card, questions }: { card: TreeCard; questions: QuestionState }) {
  const { tree, latest } = card;
  const v = t.tree.values;
  const base = `/portal/parsel/${card.parcel.id}`;
  const state = latest?.overallClass ?? "unassessed";
  return (
    <main className={styles.page} data-testid="tree-card">
      <p className={styles.noPrint}>
        <Link href={base}>
          ← {c.back} ({card.parcel.name})
        </Link>
      </p>
      <div className={styles.titleRow}>
        <h1>{tree.code}</h1>
        <div className={`${styles.actions} ${styles.noPrint}`}>
          <Link className="button button-secondary" href={`${base}/gezi?agac=${tree.id}`}>
            {t.portal.panel.openTour}
          </Link>
        </div>
      </div>

      <section className={styles.section} aria-labelledby="durum-baslik">
        <h2 id="durum-baslik">{c.latest}</h2>
        {latest ? (
          <>
            <div className={styles.classBadge} data-testid="tree-class">
              <span className={styles.swatch} style={{ background: MARKER_COLORS[state] }} />
              {t.portal.classes[state]}
            </div>
            <p className="muted">
              {t.portal.classHelp[state]} {formatDate(latest.visit.time)}
            </p>
            <div>
              <ApprovalBadge approval={latest.approval} />
            </div>
          </>
        ) : (
          <p className="muted">{c.noAssessment}</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="kimlik-baslik">
        <h2 id="kimlik-baslik">{c.identity}</h2>
        <dl className={styles.facts}>
          <dt>{c.code}</dt>
          <dd>{tree.code}</dd>
          <dt>{c.slotKind}</dt>
          <dd>{v.slotKind[tree.slotKind]}</dd>
          <dt>{t.portal.panel.sex}</dt>
          <dd>{v.sex[tree.sex]}</dd>
          <dt>{t.portal.panel.graft}</dt>
          <dd>{v.graft[tree.graft]}</dd>
          <dt>{t.portal.panel.ageClass}</dt>
          <dd>{v.ageClass[tree.ageClass]}</dd>
          <dt>{t.portal.panel.cultivar}</dt>
          <dd>{tree.cultivar ?? t.tree.unknown}</dd>
          <dt>{c.inventoryDate}</dt>
          <dd>{tree.firstSeenAt ? formatDate(tree.firstSeenAt) : t.tree.none}</dd>
          {tree.status === "lost" && (
            <>
              <dt>{c.lostAt}</dt>
              <dd>{tree.lostAt ? formatDate(tree.lostAt) : v.status.lost}</dd>
            </>
          )}
        </dl>
      </section>

      {card.classHistory.length > 0 && (
        <section className={styles.section} aria-labelledby="gecmis-baslik">
          <h2 id="gecmis-baslik">{c.classHistory}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="class-history">
              <tbody>
                {card.classHistory.map((entry) => {
                  const s = entry.overallClass ?? "unassessed";
                  return (
                    <tr key={entry.visit.id}>
                      <td>{formatDate(entry.visit.time)}</td>
                      <td>
                        <span className={styles.tileLabel}>
                          <span
                            className={styles.swatch}
                            style={{ background: MARKER_COLORS[s] }}
                          />
                          {t.portal.classes[s]}
                        </span>
                      </td>
                      <td>{t.portal.approval[entry.approval]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={styles.section} aria-labelledby="olcum-baslik">
        <h2 id="olcum-baslik">{c.measurements}</h2>
        {card.metrics.length === 0 ? (
          <p className="muted">{c.noMeasurements}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="measurement-history">
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
            </table>
          </div>
        )}
      </section>

      <Photos card={card} />

      <section className={styles.section} aria-labelledby="bulgu-baslik">
        <h2 id="bulgu-baslik">{c.findings}</h2>
        {card.findings.length === 0 ? (
          <p className="muted">{c.noFindings}</p>
        ) : (
          <ul className={styles.findings} data-testid="tree-findings">
            {card.findings.map((f) => (
              <li
                key={f.id}
                className={styles.finding}
                style={{ "--severity": SEVERITY_COLORS[f.severity] } as React.CSSProperties}
              >
                <div className={styles.findingHead}>
                  <strong style={{ color: SEVERITY_COLORS[f.severity] }}>
                    {t.portal.severity[f.severity]}
                  </strong>
                  <span>{findingKindLabel(f.kind)}</span>
                  <span className="muted">{f.visitTime && formatDate(f.visitTime)}</span>
                </div>
                <span>{f.description}</span>
                {f.recommendation && (
                  <span>
                    <strong>{t.portal.report.recommendation}: </strong>
                    {f.recommendation}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="sorular" className={styles.section} aria-labelledby="soru-baslik">
        <h2 id="soru-baslik">{t.portal.questions.title}</h2>
        <p className="muted">{t.portal.questions.treeHint}</p>
        <QuestionNotice sent={questions.sent} error={questions.error} />
        <QuestionThreads
          threads={questions.threads}
          returnPath={`${base}/agac/${tree.id}`}
          replyAction={replyQuestionAction}
          editAction={editQuestionAction}
        />
        <AskQuestionForm
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
    <section className={styles.section} aria-labelledby="foto-baslik">
      <h2 id="foto-baslik">{c.photos}</h2>
      {visits.length === 0 ? (
        <p className="muted">{c.noPhotos}</p>
      ) : (
        <>
          <p className={`muted ${styles.small}`}>{c.photosHint}</p>
          <div className={styles.photoGrid} data-testid="photo-history">
            {visits.map((visit) => {
              const items = card.photos[visit.id];
              const closeUps = items.filter((p) => p.direction === null);
              return (
                <div key={visit.id} className={styles.photoRow} data-visit-id={visit.id}>
                  <strong>{formatDate(visit.time)}</strong>
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
        {label}
        {photo && <span className={styles.hash}> · {c.hash(photo.contentHash.slice(0, 8))}</span>}
      </figcaption>
    </figure>
  );
}
