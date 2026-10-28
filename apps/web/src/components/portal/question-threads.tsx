import Link from "next/link";
import { DemoNotice } from "@/components/demo/demo-notice";
import { formatDate, t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import { portalBillingText } from "@/lib/i18n/messages/portal-billing";
import type { QuestionMessage, QuestionThread } from "@/lib/portal/questions";
import { findingKindLabel } from "./labels";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import styles from "./parcel.module.css";

// Question threads with reply and edit forms. Used by the portal (owner,
// viewer) and the expert panel; the forms post to the section's own actions.
// A demo visitor (`demo`) reads the threads without any form; so does
// everyone on a removed garden (`readOnly`, IP14: the database refuses the
// writes with parcel_read_only).

type Action = (form: FormData) => void | Promise<void>;

const q = t.portal.questions;

function author(m: QuestionMessage): string {
  return m.mine ? q.authors.mine : q.authors[m.authorRole];
}

function time(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)} ${hh}:${mm}`;
}

export function QuestionThreads({
  threads,
  returnPath,
  replyAction,
  editAction,
  treeHref,
  showContext = false,
  demo = false,
  readOnly = false,
}: {
  threads: QuestionThread[];
  returnPath: string;
  replyAction: Action;
  editAction: Action;
  // Link to the tree of a thread (context line), when there is a page for it.
  treeHref?: (thread: QuestionThread) => string | null;
  showContext?: boolean;
  demo?: boolean;
  readOnly?: boolean;
}) {
  if (threads.length === 0) return <p className="muted">{q.empty}</p>;
  const forms = !demo && !readOnly;
  return (
    <ul className={styles.threads} data-testid="question-threads">
      {threads.map((thread) => {
        const href = treeHref?.(thread) ?? null;
        return (
          <li
            key={thread.id}
            className={styles.thread}
            data-question-id={thread.id}
            data-answered={thread.answered ? "1" : "0"}
          >
            <div className={styles.threadHead}>
              <Badge tone={thread.answered ? "success" : "warning"}>
                {thread.answered ? q.answered : q.open}
              </Badge>
              {showContext && thread.parcelName && <strong>{thread.parcelName}</strong>}
              {thread.treeCode &&
                (href ? (
                  <Link href={href}>{q.about.tree(thread.treeCode)}</Link>
                ) : (
                  <span>{q.about.tree(thread.treeCode)}</span>
                ))}
              {thread.findingKind && (
                <span className="muted">
                  {q.about.finding(findingKindLabel(thread.findingKind))}
                </span>
              )}
            </div>
            <ol className={styles.messages}>
              {thread.messages.map((m) => (
                <li
                  key={m.id}
                  className={m.mine ? styles.messageMine : styles.message}
                  data-testid="question-message"
                >
                  <p className={`muted ${styles.small}`}>
                    <strong>{author(m)}</strong>, {time(m.createdAt)}
                    {m.editedAt && ` (${q.edited})`}
                  </p>
                  <p className={styles.messageBody}>{m.body}</p>
                  {m.editable && forms && (
                    <details className={`${styles.disclosure} ${styles.noPrint}`}>
                      <summary>{q.edit}</summary>
                      <form action={editAction} className={styles.reply}>
                        <input type="hidden" name="kind" value={m.kind} />
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="return" value={returnPath} />
                        <textarea
                          name="body"
                          defaultValue={m.body}
                          maxLength={2000}
                          required
                          aria-label={q.edit}
                        />
                        <div className={styles.formActions}>
                          <Button variant="secondary" type="submit">
                            {q.save}
                          </Button>
                        </div>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ol>
            {forms && (
              <form action={replyAction} className={`${styles.reply} ${styles.noPrint}`}>
                <input type="hidden" name="questionId" value={thread.id} />
                <input type="hidden" name="return" value={returnPath} />
                <label>
                  {q.reply}
                  <textarea
                    name="body"
                    rows={2}
                    maxLength={2000}
                    required
                    aria-label={q.replyLabel}
                  />
                </label>
                <div className={styles.formActions}>
                  <Button variant="secondary" type="submit">
                    {q.send}
                  </Button>
                </div>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface QuestionTarget {
  value: string;
  label: string;
}

// New question: on the tree ("tree") or one of the given findings ("finding:<id>").
export function AskQuestionForm({
  parcelId,
  treeId,
  targets,
  returnPath,
  action,
  title,
  demo = false,
  readOnly = false,
}: {
  parcelId: string;
  treeId: string | null;
  targets: QuestionTarget[];
  returnPath: string;
  action: Action;
  title: string;
  demo?: boolean;
  readOnly?: boolean;
}) {
  if (demo) return <DemoNotice text={demoText.closed.questions} />;
  if (readOnly) {
    return (
      <p className="muted" data-testid="questions-read-only">
        {portalBillingText.removal.readOnlyQuestions}
      </p>
    );
  }
  if (targets.length === 0) return null;
  const id = treeId ? `ask-${treeId}` : `ask-${parcelId}`;
  return (
    <form action={action} className={`${styles.form} ${styles.noPrint}`} data-testid="ask-question">
      <h3>{title}</h3>
      <input type="hidden" name="parcelId" value={parcelId} />
      <input type="hidden" name="treeId" value={treeId ?? ""} />
      <input type="hidden" name="return" value={returnPath} />
      {targets.length > 1 ? (
        <Field id={`${id}-target`} label={q.target}>
          <Select name="target" defaultValue={targets[0].value}>
            {targets.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <>
          <input type="hidden" name="target" value={targets[0].value} />
          <p className={`${styles.small} muted`}>
            {q.target}: {targets[0].label}
          </p>
        </>
      )}
      <Field id={`${id}-body`} label={q.body} hint={q.editHint}>
        <Textarea name="body" maxLength={2000} required rows={3} />
      </Field>
      <div className={styles.formActions}>
        <Button variant="secondary" type="submit">
          {q.ask}
        </Button>
      </div>
    </form>
  );
}

// Status line after a question action (?soru=1 / ?soru_hata=…).
export function QuestionNotice({ sent, error }: { sent: boolean; error: string | null }) {
  if (error) {
    return (
      <Alert tone="danger" role="alert">
        <p>
          {error === "demo_read_only"
            ? demoText.closed.questions
            : error === "parcel_read_only"
              ? portalBillingText.removal.readOnlyQuestions
              : (q.errors[error] ?? q.errors.write_failed)}
        </p>
      </Alert>
    );
  }
  if (sent) {
    return (
      <Alert tone="success" role="status">
        <p>{q.sent}</p>
      </Alert>
    );
  }
  return null;
}
