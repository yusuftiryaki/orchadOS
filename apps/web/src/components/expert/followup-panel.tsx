import { cancelFollowupAction, requestFollowupAction } from "@/app/uzman/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { statusTone } from "@/components/ui/status";
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
  embedded = false,
}: {
  sessionId: string;
  // null: the parcel-level form (extra visit).
  treeId: string | null;
  followups: Followup[];
  returnPath: string;
  message?: { saved: boolean; error: string | null };
  // Inside a tab of the review page: no frame of its own, the tab names it.
  embedded?: boolean;
}) {
  const kinds = treeId ? (["closeup", "verification"] as const) : (["extra_visit"] as const);
  const idBase = treeId ? `followup-${treeId}` : "followup-parcel";
  return (
    <section
      className={embedded ? styles.tabBody : styles.panel}
      data-testid={treeId ? "tree-followups" : "parcel-followups"}
    >
      <h3 className={embedded ? "sr-only" : undefined}>{treeId ? f.title : f.parcelTitle}</h3>
      <p className={styles.small}>{treeId ? f.treeHint : f.parcelHint}</p>
      {message?.saved && (
        <Alert tone="success" role="status">
          {f.saved}
        </Alert>
      )}
      {message?.error && (
        <Alert tone="danger" role="alert">
          {f.errors[message.error] ?? f.errors.write_failed}
        </Alert>
      )}
      {followups.length === 0 ? (
        <p className={styles.small}>{f.none}</p>
      ) : (
        <ul className={styles.items}>
          {followups.map((item) => (
            <li
              key={item.id}
              className={styles.item}
              data-followup-kind={item.kind}
              data-followup-status={item.status}
              data-followup-origin={item.origin}
            >
              <div className={styles.itemHead}>
                <strong>{f.kinds[item.kind]}</strong>
                <Badge tone={statusTone(item.status)}>{f.status[item.status]}</Badge>
                {item.origin === "pipeline" && <Badge>{f.origin.pipeline}</Badge>}
                <span className={styles.muted}>{formatDate(item.createdAt)}</span>
              </div>
              {item.note && <p>{item.note}</p>}
              {(item.status === "open" || item.status === "planned") && (
                <form action={cancelFollowupAction}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="return" value={returnPath} />
                  <Button variant="quiet" size="sm" type="submit">
                    {f.cancel}
                  </Button>
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
          <Field id={`${idBase}-kind`} label={f.kind}>
            <Select name="kind" defaultValue={kinds[0]}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {f.kinds[k]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="kind" value={kinds[0]} />
        )}
        <Field id={`${idBase}-note`} label={f.note}>
          <Textarea
            name="note"
            rows={2}
            maxLength={2000}
            placeholder={f.notePlaceholder}
            required={!treeId}
          />
        </Field>
        <div>
          <Button variant="secondary" type="submit">
            {treeId ? f.submit : f.submitVisit}
          </Button>
        </div>
      </form>
    </section>
  );
}
