import { hideMediaAction, unhideMediaAction } from "@/app/operasyon/legal-actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { TabLinks } from "@/components/ui/tab-links";
import { Table, cell } from "@/components/ui/table";
import { formatDateTime, t } from "@/lib/i18n";
import {
  HIDE_REASONS,
  type MediaTab,
  type SuppressionRecord,
  type VisitMediaItem,
} from "@/lib/operations/legal";
import { Field } from "./field";
import { Panel } from "./ops-ui";
import styles from "./media-suppression.module.css";

const T = t.legal.media;

// T20 (H01): ops hides a panorama, crop or close-up after a person's
// objection, and lifts it again. Hidden images keep showing here with a
// "Gizlendi" badge; owners, viewers, the demo and experts no longer see them.
export function MediaSuppression({
  back,
  records,
  urls,
  gallery,
}: {
  // The page to return to after an action (an /operasyon path).
  back: string;
  // Hide/unhide records of the visit or parcel, newest first.
  records: SuppressionRecord[];
  // uri -> signed URL (ops reads hidden files too).
  urls: Map<string, string | null>;
  // The visit page's browser of its images; absent on the parcel page.
  gallery?: {
    tab: MediaTab;
    page: number;
    more: boolean;
    items: VisitMediaItem[];
    href: (tab: MediaTab, page: number) => string;
  };
}) {
  const current = new Map<string, SuppressionRecord>();
  for (const r of records) if (!current.has(r.targetId)) current.set(r.targetId, r);
  const hidden = [...current.values()].filter((r) => r.hiddenNow);
  return (
    <Panel title={T.title} description={T.hint} testId="media-suppression">
      <section className={styles.part}>
        <h3 className={styles.heading}>{T.hiddenTitle}</h3>
        {hidden.length === 0 ? (
          <p className="muted" data-testid="hidden-none">
            {T.none}
          </p>
        ) : (
          <Table data-testid="hidden-media">
            <thead>
              <tr>
                <th>{T.columns.preview}</th>
                <th>{T.columns.kind}</th>
                <th>{T.columns.reason}</th>
                <th className={cell.num}>{T.columns.when}</th>
                <th>{T.columns.action}</th>
              </tr>
            </thead>
            <tbody>
              {hidden.map((r) => (
                <tr key={r.targetId} data-hidden-id={r.targetId}>
                  <td>
                    <Thumb url={r.uri ? (urls.get(r.uri) ?? null) : null} />
                  </td>
                  <td>
                    <div className={styles.kind}>
                      <Badge tone="warning">{T.hidden}</Badge>
                      {T.kinds[r.kind ?? ""] ?? r.kind}
                    </div>
                  </td>
                  <td>{T.reasons[r.reason] ?? r.reason}</td>
                  <td className={cell.num}>{formatDateTime(r.createdAt)}</td>
                  <td>
                    <form action={unhideMediaAction} className={styles.rowForm}>
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="id" value={r.targetId} />
                      <Input name="note" aria-label={T.note} placeholder={T.note} maxLength={500} />
                      <Button variant="secondary" size="sm" type="submit">
                        {T.unhide}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className={styles.part}>
        <h3 className={styles.heading}>{T.byId}</h3>
        <HideForm back={back} />
      </section>

      {gallery && (
        <section className={styles.part}>
          <TabLinks
            label={T.title}
            items={(["panorama", "tree_crop", "closeup"] as const).map((tab) => ({
              href: gallery.href(tab, 0),
              label: T.tabs[tab],
              current: gallery.tab === tab,
            }))}
          />
          {gallery.items.length === 0 ? (
            <p className="muted">{T.empty}</p>
          ) : (
            <ul className={styles.gallery} data-testid="media-gallery">
              {gallery.items.map((item) => {
                const isHidden = current.get(item.id)?.hiddenNow ?? false;
                return (
                  <li key={item.id} data-media-id={item.id} className={styles.tile}>
                    <Thumb url={urls.get(item.uri) ?? null} />
                    <code className={styles.id}>{item.id}</code>
                    {isHidden ? (
                      <Badge tone="warning">{T.hidden}</Badge>
                    ) : (
                      <HideForm back={back} id={item.id} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {(gallery.page > 0 || gallery.more) && (
            <nav className={styles.pager} aria-label={T.tabs[gallery.tab]}>
              <span className="muted">{T.pageOf(gallery.page + 1)}</span>
              {gallery.page > 0 && (
                <ButtonLink
                  variant="secondary"
                  size="sm"
                  href={gallery.href(gallery.tab, gallery.page - 1)}
                  rel="prev"
                >
                  {T.previous}
                </ButtonLink>
              )}
              {gallery.more && (
                <ButtonLink
                  variant="secondary"
                  size="sm"
                  href={gallery.href(gallery.tab, gallery.page + 1)}
                  rel="next"
                >
                  {T.next}
                </ButtonLink>
              )}
            </nav>
          )}
        </section>
      )}

      {records.length > 0 && (
        <details className={styles.history}>
          <summary>{T.history}</summary>
          <Table>
            <thead>
              <tr>
                <th>{T.columns.action}</th>
                <th>{T.columns.kind}</th>
                <th>{T.columns.id}</th>
                <th>{T.columns.reason}</th>
                <th>{T.columns.who}</th>
                <th className={cell.num}>{T.columns.when}</th>
                <th>{T.columns.note}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{T.action[r.action]}</td>
                  <td>{T.kinds[r.kind ?? ""] ?? r.kind}</td>
                  <td className={cell.code}>{r.targetId}</td>
                  <td>{T.reasons[r.reason] ?? r.reason}</td>
                  <td>{r.actorEmail ?? "—"}</td>
                  <td className={cell.num}>{formatDateTime(r.createdAt)}</td>
                  <td>{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
      )}
    </Panel>
  );
}

function HideForm({ back, id }: { back: string; id?: string }) {
  const key = id ?? "by-id";
  return (
    <form
      action={hideMediaAction}
      className={id ? styles.tileForm : styles.byId}
      data-testid="hide-media-form"
    >
      <input type="hidden" name="back" value={back} />
      {id ? (
        <input type="hidden" name="id" value={id} />
      ) : (
        <Field label={T.idLabel}>
          <Input name="id" required pattern="[0-9a-fA-F-]{36}" title={T.idHint} />
        </Field>
      )}
      {id ? reasonSelect(key, T.reason) : <Field label={T.reason}>{reasonSelect(key)}</Field>}
      <Input name="note" aria-label={T.note} placeholder={T.note} maxLength={500} />
      <Button variant="secondary" size="sm" type="submit">
        {T.hide}
      </Button>
      {!id && <p className={styles.hint}>{T.idHint}</p>}
    </form>
  );
}

// The reason of a hide; in a gallery tile the select names itself.
function reasonSelect(key: string, ariaLabel?: string) {
  return (
    <Select
      name="reason"
      id={`hide-reason-${key}`}
      aria-label={ariaLabel}
      defaultValue="kvkk_objection"
    >
      {HIDE_REASONS.map((r) => (
        <option key={r} value={r}>
          {T.reasons[r]}
        </option>
      ))}
    </Select>
  );
}

function Thumb({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs
    <img className={styles.thumb} src={url} alt="" width={120} height={60} loading="lazy" />
  ) : (
    <span className={styles.noThumb}>{T.noImage}</span>
  );
}
