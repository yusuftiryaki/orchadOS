import Link from "next/link";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/i18n";
import { opsUiText } from "@/lib/i18n/messages/back-office";
import styles from "./queue-list.module.css";

export interface QueueItem {
  key: string;
  label: ReactNode;
  value: number;
  href: string;
  // How urgent a non-zero value is: "danger" (late, failed), "warning"
  // (waits on us today), "info" (in progress). A status breakdown passes the
  // state's own tone (statusTone), so "success" and "neutral" are allowed too.
  tone?: "danger" | "warning" | "info" | "success" | "neutral";
}

// Work queues: a count per kind of work. Non-zero counts are links in their
// tone, most urgent first; the empty queues follow as one quiet line, so what
// needs action stands out and nothing is hidden.
export function QueueList({
  items,
  testId,
  label,
  ordered = false,
}: {
  items: QueueItem[];
  testId?: string;
  label?: string;
  // Keep the given order (a status breakdown in pipeline order) instead of
  // sorting the work queues by urgency.
  ordered?: boolean;
}) {
  const rank = { danger: 0, warning: 1, info: 2, success: 3, neutral: 4 } as const;
  const open = items.filter((i) => i.value > 0);
  if (!ordered) open.sort((a, b) => rank[a.tone ?? "info"] - rank[b.tone ?? "info"]);
  const empty = items.filter((i) => i.value <= 0);
  return (
    <div className={styles.queueWrap} data-testid={testId}>
      {open.length > 0 && (
        <ul className={styles.queues} aria-label={label}>
          {open.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={styles.queue}
                data-tone={item.tone ?? "info"}
                data-stat={item.key}
              >
                <span className={styles.queueValue}>{formatNumber(item.value)}</span>
                <span className={styles.queueLabel}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {empty.length > 0 && (
        <ul
          className={styles.queueZero}
          aria-label={label ? opsUiText.queuesEmpty(label) : undefined}
        >
          {empty.map((item) => (
            <li key={item.key} data-stat={item.key}>
              <span className={styles.queueZeroValue}>{formatNumber(item.value)}</span> {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
