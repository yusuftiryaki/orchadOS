import Link from "next/link";
import { openVisitAction } from "@/app/uzman/actions";
import { statusTone } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cell, Table } from "@/components/ui/table";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import type { ParcelSummary } from "@/lib/parcels";
import type { InventoryQueueItem } from "@/lib/expert/inventory";
import type { QueueItem } from "@/lib/expert/review";
import { ExpertHeader } from "./expert-nav";
import styles from "./expert.module.css";
import staff from "@/components/staff-page.module.css";
import { SessionStatusBadge } from "./status";

// Visits waiting for the expert, inventories waiting for approval, then the
// parcels of the org.
export function VisitQueue({
  queue,
  inventories,
  parcels,
  openQuestions = 0,
}: {
  queue: QueueItem[];
  inventories: InventoryQueueItem[];
  parcels: ParcelSummary[];
  openQuestions?: number;
}) {
  const q = t.expert.queue;
  return (
    <main className={`page ${staff.page} ${styles.page}`}>
      <ExpertHeader current="queue" openQuestions={openQuestions} />

      <section className={styles.section} aria-labelledby="queue-title">
        <h2 id="queue-title">{q.title}</h2>
        <p className={styles.sectionHint}>{q.hint}</p>
        {queue.length === 0 ? (
          <EmptyState title={q.empty} headingLevel={3}>
            {q.emptyHint}
          </EmptyState>
        ) : (
          <Table data-testid="visit-queue">
            <thead>
              <tr>
                <th scope="col">{q.columns.parcel}</th>
                <th scope="col">{q.columns.date}</th>
                <th scope="col">{q.columns.kind}</th>
                <th scope="col">{q.columns.status}</th>
                <th scope="col" className={cell.num}>
                  {q.columns.trees}
                </th>
                <th scope="col" className={cell.num}>
                  {q.columns.reviewed}
                </th>
                <th scope="col" className={cell.num}>
                  {q.columns.remaining}
                </th>
                <th scope="col">
                  <span className="sr-only">{q.columns.action}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.sessionId} data-session-id={item.sessionId}>
                  <td className={styles.strong}>{item.parcelName}</td>
                  <td className={styles.nowrap}>{formatDate(item.time)}</td>
                  <td>{t.expert.kinds[item.kind]}</td>
                  <td>
                    <SessionStatusBadge status={item.status} />
                  </td>
                  <td className={cell.num}>{formatNumber(item.treeCount)}</td>
                  <td className={cell.num}>{formatNumber(item.reviewedCount)}</td>
                  <td className={cell.num}>{formatNumber(item.treeCount - item.reviewedCount)}</td>
                  <td className={styles.rowAction}>
                    <form action={openVisitAction}>
                      <input type="hidden" name="sessionId" value={item.sessionId} />
                      <Button variant="secondary" size="sm" type="submit">
                        {q.open}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <InventoryQueue items={inventories} />

      <section className={styles.section} aria-labelledby="parcels-title">
        <h2 id="parcels-title">{q.parcels}</h2>
        {parcels.length === 0 ? (
          <EmptyState title={t.parcels.empty} headingLevel={3} />
        ) : (
          <Table data-testid="parcel-list">
            <thead>
              <tr>
                <th scope="col">{t.parcels.columns.name}</th>
                <th scope="col">{t.parcels.columns.location}</th>
                <th scope="col">{t.parcels.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {parcels.map((parcel) => (
                <tr key={parcel.id} data-parcel-id={parcel.id}>
                  <td className={styles.strong}>
                    <Link href={`/uzman/parsel/${parcel.id}`}>{parcel.name}</Link>
                  </td>
                  <td>
                    {[parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ")}
                  </td>
                  <td>
                    <Badge tone={statusTone(parcel.status, "parcel")}>
                      {t.parcels.status[parcel.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </main>
  );
}

function InventoryQueue({ items }: { items: InventoryQueueItem[] }) {
  const e = t.inventory.expert;
  return (
    <section
      className={styles.section}
      data-testid="inventory-queue-section"
      aria-labelledby="inventory-queue-title"
    >
      <h2 id="inventory-queue-title">{e.queueTitle}</h2>
      <p className={styles.sectionHint}>{e.queueHint}</p>
      {items.length === 0 ? (
        <EmptyState title={e.queueEmpty} headingLevel={3} />
      ) : (
        <Table data-testid="inventory-queue">
          <thead>
            <tr>
              <th scope="col">{e.queueColumns.parcel}</th>
              <th scope="col">{e.queueColumns.date}</th>
              <th scope="col">{e.queueColumns.status}</th>
              <th scope="col" className={cell.num}>
                {e.queueColumns.slots}
              </th>
              <th scope="col" className={cell.num}>
                {e.queueColumns.trees}
              </th>
              <th scope="col" className={cell.num}>
                {e.queueColumns.openItems}
              </th>
              <th scope="col">
                <span className="sr-only">{t.expert.queue.columns.action}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sessionId} data-session-id={item.sessionId}>
                <td className={styles.strong}>{item.parcelName}</td>
                <td className={styles.nowrap}>{formatDate(item.time)}</td>
                <td>
                  <SessionStatusBadge status={item.status} />
                </td>
                <td className={cell.num}>{formatNumber(item.slots)}</td>
                <td className={cell.num}>{formatNumber(item.trees)}</td>
                <td className={cell.num}>{formatNumber(item.openItems)}</td>
                <td className={styles.rowAction}>
                  <ButtonLink
                    variant="secondary"
                    size="sm"
                    href={`/uzman/envanter/${item.sessionId}`}
                  >
                    {e.open}
                  </ButtonLink>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
