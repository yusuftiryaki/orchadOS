import { Badge } from "@/components/ui/badge";
import { Table, cell } from "@/components/ui/table";
import { countReasons, type CloseupItem, type CloseupReason } from "@/lib/expert/followups";
import { formatNumber, t } from "@/lib/i18n";
import { Panel } from "./ops-ui";
import styles from "./operations.module.css";

// Close-up list of a periodic scan (closeup_list): the trees the crew
// photographs up close, with the reasons.

const c = t.expert.closeup;
const REASONS: CloseupReason[] = ["previous_class", "sample", "staff_problem", "expert_request"];

export function CloseupList({ items }: { items: CloseupItem[] }) {
  const counts = countReasons(items);
  return (
    <Panel
      title={c.title}
      description={c.hint}
      actions={<Badge tone="info">{c.count(items.length)}</Badge>}
      testId="closeup-list"
    >
      <Table>
        <tbody>
          {REASONS.map((r) => (
            <tr key={r} data-reason={r}>
              <td>{c.reasons[r]}</td>
              <td className={cell.num}>{formatNumber(counts[r])}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {items.length === 0 ? (
        <p className="muted">{c.empty}</p>
      ) : (
        <details className={styles.disclosure}>
          <summary>{c.count(items.length)}</summary>
          <Table>
            <tbody>
              {items.map((item) => (
                <tr key={item.treeId} data-code={item.code}>
                  <td className={cell.code}>{item.code}</td>
                  <td>{item.reasons.map((r) => c.reasons[r]).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
      )}
    </Panel>
  );
}
