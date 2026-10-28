import { FormError, Notice } from "@/components/operations/field";
import { NotificationTable } from "@/components/operations/notification-table";
import { FilterTabs, Pagination, Toolbar, pageOf } from "@/components/operations/ops-ui";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import {
  listNotifications,
  NOTIFICATION_STATUSES,
  type NotificationRow,
  type NotificationStatus,
} from "@/lib/notifications/data";
import { notificationsHref } from "@/lib/notifications/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.notifications;
// The newest this many of each status; the counts of the tabs.
const LIMIT = 100;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Latest notifications of the ops orgs, with status tabs (?durum=pending|
// sent|failed) and their counts, newest first; failed ones can be queued
// again. Phone numbers are masked.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("operasyon");
  const params = await searchParams;
  const status = first(params.durum);
  const result = first(params.sonuc);
  const chosen = (NOTIFICATION_STATUSES as readonly string[]).includes(status)
    ? (status as NotificationStatus)
    : null;

  // One query per status: the tabs get their counts, and the newest LIMIT
  // of all statuses are among the newest LIMIT of each.
  const supabase = await createClient();
  const byStatus = new Map<NotificationStatus, NotificationRow[]>(
    await Promise.all(
      NOTIFICATION_STATUSES.map(
        async (s) => [s, await listNotifications(supabase, { status: s, limit: LIMIT })] as const,
      ),
    ),
  );
  const rows = chosen
    ? (byStatus.get(chosen) ?? [])
    : [...byStatus.values()]
        .flat()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .slice(0, LIMIT);
  const page = pageOf(rows, params.sayfa);
  const total = [...byStatus.values()].reduce((n, list) => n + list.length, 0);
  const count = (n: number) => (n >= LIMIT ? undefined : n);

  return (
    <main className="page">
      <PageHeader title={T.title} lead={T.intro} />
      {result === "retried" && <Notice>{T.retried}</Notice>}
      <FormError error={result === "retry_failed" ? T.retryFailed : null} />

      <div>
        <Toolbar end={rows.length > 0 ? T.count(rows.length) : undefined}>
          <FilterTabs
            label={T.filters}
            testId="notification-status-filter"
            items={[
              {
                href: notificationsHref(),
                label: T.allStatuses,
                count: count(total),
                current: !chosen,
              },
              ...NOTIFICATION_STATUSES.map((s) => ({
                href: notificationsHref(s),
                label: T.status[s],
                count: count(byStatus.get(s)?.length ?? 0),
                current: chosen === s,
              })),
            ]}
          />
        </Toolbar>
        {rows.length === 0 ? (
          chosen ? (
            <EmptyState
              title={T.emptyStatus(T.status[chosen])}
              action={
                <ButtonLink variant="secondary" href={notificationsHref()}>
                  {T.showAll}
                </ButtonLink>
              }
            >
              {chosen === "failed" && <p>{T.emptyFailed}</p>}
            </EmptyState>
          ) : (
            <EmptyState title={T.empty}>
              <p>{T.emptyHint}</p>
            </EmptyState>
          )
        ) : (
          <>
            <NotificationTable rows={page.rows} status={chosen ?? ""} />
            <Pagination
              {...page}
              href={(p) => {
                const base = notificationsHref(chosen ?? undefined);
                return `${base}${base.includes("?") ? "&" : "?"}sayfa=${p}`;
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}
