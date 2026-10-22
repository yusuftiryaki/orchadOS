import { cancelFollowupAction, requestFollowupAction } from "@/app/uzman/actions";
import type { Followup } from "@/lib/expert/followups";
import { formatDate, t } from "@/lib/i18n";
import styles from "./expert.module.css";

// Follow-up requests of a tree (close-up on the next visit, verification) or
// of the parcel (extra visit). Requests are not results: they can be made
// after publication too, and owners never see them.

const f = t.expert.followups;

export function FollowupPanel({
  sessionId,
  treeId,
  followups,
  returnPath,
  message,
}: {
  sessionId: string;
  // null: the parcel-level form (extra visit).
  treeId: string | null;
  followups: Followup[];
  returnPath: string;
  message?: { saved: boolean; error: string | null };
}) {
  const kinds = treeId ? (["closeup", "verification"] as const) : (["extra_visit"] as const);
  return (
    <section className={styles.panel} data-testid={treeId ? "tree-followups" : "parcel-followups"}>
      <h3>{treeId ? f.title : f.parcelTitle}</h3>
      <p className="muted">{treeId ? f.treeHint : f.parcelHint}</p>
      {message?.saved && <p role="status">{f.saved}</p>}
      {message?.error && (
        <p className="error" role="alert">
          {f.errors[message.error] ?? f.errors.write_failed}
        </p>
      )}
      {followups.length === 0 ? (
        <p className="muted">{f.none}</p>
      ) : (
        <ul className={styles.findings}>
          {followups.map((item) => (
            <li key={item.id} data-followup-kind={item.kind} data-followup-status={item.status}>
              <strong>{f.kinds[item.kind]}</strong> · {f.status[item.status]} ·{" "}
              <span className="muted">{formatDate(item.createdAt)}</span>
              {item.note && <p>{item.note}</p>}
              {(item.status === "open" || item.status === "planned") && (
                <form action={cancelFollowupAction}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="return" value={returnPath} />
                  <button className="button button-secondary" type="submit">
                    {f.cancel}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <form action={requestFollowupAction} className={styles.form}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="treeId" value={treeId ?? ""} />
        <input type="hidden" name="return" value={returnPath} />
        {kinds.length > 1 ? (
          <label>
            {f.kind}
            <select name="kind" defaultValue={kinds[0]}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {f.kinds[k]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="kind" value={kinds[0]} />
        )}
        <label>
          {f.note}
          <textarea
            name="note"
            rows={2}
            maxLength={2000}
            placeholder={f.notePlaceholder}
            required={!treeId}
          />
        </label>
        <button className="button" type="submit">
          {treeId ? f.submit : f.submitVisit}
        </button>
      </form>
    </section>
  );
}
