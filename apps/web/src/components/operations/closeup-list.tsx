import { countReasons, type CloseupItem, type CloseupReason } from "@/lib/expert/followups";
import { formatNumber, t } from "@/lib/i18n";
import styles from "./operations.module.css";

// Close-up list of a periodic scan (closeup_list): the trees the crew
// photographs up close, with the reasons.

const c = t.expert.closeup;
const REASONS: CloseupReason[] = ["previous_class", "sample", "staff_problem", "expert_request"];

export function CloseupList({ items }: { items: CloseupItem[] }) {
  const counts = countReasons(items);
  return (
    <section className={styles.section} data-testid="closeup-list">
      <h2>
        {c.title} · {c.count(items.length)}
      </h2>
      <p className="muted">{c.hint}</p>
      <ul className={styles.inlineList}>
        {REASONS.map((r) => (
          <li key={r} data-reason={r}>
            {c.reasons[r]}: <strong>{formatNumber(counts[r])}</strong>
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="muted">{c.empty}</p>
      ) : (
        <details>
          <summary>{c.count(items.length)}</summary>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                {items.map((item) => (
                  <tr key={item.treeId} data-code={item.code}>
                    <td>{item.code}</td>
                    <td>{item.reasons.map((r) => c.reasons[r]).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
