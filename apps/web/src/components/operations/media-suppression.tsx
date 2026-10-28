import Link from "next/link";
import { hideMediaAction, unhideMediaAction } from "@/app/operasyon/legal-actions";
import { formatDateTime, t } from "@/lib/i18n";
import {
  HIDE_REASONS,
  type MediaTab,
  type SuppressionRecord,
  type VisitMediaItem,
} from "@/lib/operations/legal";
import styles from "./operations.module.css";

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
    <section className={styles.section} data-testid="media-suppression">
      <h2>{T.title}</h2>
      <p className="muted">{T.hint}</p>

      <h3>{T.hiddenTitle}</h3>
      {hidden.length === 0 ? (
        <p className="muted" data-testid="hidden-none">
          {T.none}
        </p>
      ) : (
        <ul className={styles.inlineList} data-testid="hidden-media">
          {hidden.map((r) => (
            <li key={r.targetId} data-hidden-id={r.targetId}>
              <Thumb url={r.uri ? (urls.get(r.uri) ?? null) : null} />
              <span className={styles.badge}>{T.hidden}</span> {T.kinds[r.kind ?? ""] ?? r.kind} ·{" "}
              {T.reasons[r.reason] ?? r.reason} · {formatDateTime(r.createdAt)}
              <form action={unhideMediaAction} className={styles.inline}>
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={r.targetId} />
                <input name="note" aria-label={T.note} placeholder={T.note} maxLength={500} />
                <button className="button button-secondary" type="submit">
                  {T.unhide}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h3>{T.byId}</h3>
      <HideForm back={back} />

      {gallery && (
        <>
          <nav className={styles.inline} aria-label={T.title}>
            {(["panorama", "tree_crop", "closeup"] as const).map((tab) => (
              <Link
                key={tab}
                href={gallery.href(tab, 0)}
                aria-current={gallery.tab === tab ? "page" : undefined}
              >
                {T.tabs[tab]}
              </Link>
            ))}
          </nav>
          {gallery.items.length === 0 ? (
            <p className="muted">{T.empty}</p>
          ) : (
            <ul className={styles.inlineList} data-testid="media-gallery">
              {gallery.items.map((item) => {
                const isHidden = current.get(item.id)?.hiddenNow ?? false;
                return (
                  <li key={item.id} data-media-id={item.id}>
                    <Thumb url={urls.get(item.uri) ?? null} />
                    <code>{item.id}</code>
                    {isHidden ? (
                      <span className={styles.badge}>{T.hidden}</span>
                    ) : (
                      <HideForm back={back} id={item.id} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.inline}>
            {gallery.page > 0 && (
              <Link href={gallery.href(gallery.tab, gallery.page - 1)}>{T.previous}</Link>
            )}
            {gallery.more && (
              <Link href={gallery.href(gallery.tab, gallery.page + 1)}>{T.next}</Link>
            )}
          </p>
        </>
      )}

      {records.length > 0 && (
        <details>
          <summary>{T.history}</summary>
          <ul>
            {records.map((r) => (
              <li key={r.id}>
                {T.action[r.action]} · {T.kinds[r.kind ?? ""] ?? r.kind} <code>{r.targetId}</code> ·{" "}
                {T.reasons[r.reason] ?? r.reason} ·{" "}
                {T.byWhom(r.actorEmail, formatDateTime(r.createdAt))}
                {r.note && <> · {r.note}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function HideForm({ back, id }: { back: string; id?: string }) {
  return (
    <form action={hideMediaAction} className={styles.inline} data-testid="hide-media-form">
      <input type="hidden" name="back" value={back} />
      {id ? (
        <input type="hidden" name="id" value={id} />
      ) : (
        <label>
          {T.idLabel}
          <input name="id" required pattern="[0-9a-fA-F-]{36}" title={T.idHint} />
        </label>
      )}
      <label>
        {T.reason}
        <select name="reason" defaultValue="kvkk_objection">
          {HIDE_REASONS.map((r) => (
            <option key={r} value={r}>
              {T.reasons[r]}
            </option>
          ))}
        </select>
      </label>
      <input name="note" aria-label={T.note} placeholder={T.note} maxLength={500} />
      <button className="button button-secondary" type="submit">
        {T.hide}
      </button>
    </form>
  );
}

function Thumb({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs
    <img src={url} alt="" width={120} height={60} loading="lazy" />
  ) : (
    <span className="muted">{T.noImage}</span>
  );
}
