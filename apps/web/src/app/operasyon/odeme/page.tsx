import Link from "next/link";
import { Badge, money, when } from "@/components/back-office/parts";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pagination, pageOf } from "@/components/ui/pagination";
import { Toolbar } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { listPayments } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const T = backOfficeText.payments;
const STATUSES = [
  "initiated",
  "pending_review",
  "succeeded",
  "failed",
  "expired",
  "voided",
] as const;
const PROVIDERS = ["iyzico", "manual", "fake"] as const;

// Payments (card attempts and transfers) with status and method filters,
// each with its count. All payments are read once; the filters and their
// counts come from the same rows.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const status = pick(query.durum, STATUSES);
  const provider = pick(query.yontem, PROVIDERS);
  const supabase = await createClient();
  const all = await listPayments(supabase, await opsOrgs(supabase, user.id), {
    status: null,
    provider: null,
  });
  const ofProvider = provider ? all.filter((p) => p.provider === provider) : all;
  const ofStatus = status ? all.filter((p) => p.status === status) : all;
  const rows = status ? ofProvider.filter((p) => p.status === status) : ofProvider;
  const page = pageOf(rows, query.sayfa);
  const href = (q: { durum?: string | null; yontem?: string | null }) => boHref.payments(q);
  const pageHref = (p: number) => {
    const base = href({ durum: status, yontem: provider });
    return `${base}${base.includes("?") ? "&" : "?"}sayfa=${p}`;
  };

  return (
    <main className="page">
      <PageHeader title={T.title} />
      <section aria-label={T.title}>
        <Toolbar end={<span className="muted">{T.count(rows.length)}</span>}>
          <FilterTabs
            label={T.filterStatus}
            testId="payment-filter"
            items={[
              {
                href: href({ yontem: provider }),
                label: backOfficeText.all,
                count: ofProvider.length,
                current: !status,
              },
              ...STATUSES.map((s) => ({
                href: href({ durum: s, yontem: provider }),
                label: billingText.paymentStatus[s],
                count: ofProvider.filter((p) => p.status === s).length,
                current: status === s,
              })),
            ]}
          />
          <FilterTabs
            label={T.filterMethod}
            items={[
              {
                href: href({ durum: status }),
                label: backOfficeText.all,
                count: ofStatus.length,
                current: !provider,
              },
              ...PROVIDERS.map((p) => ({
                href: href({ durum: status, yontem: p }),
                label: billingText.paymentProvider[p],
                count: ofStatus.filter((r) => r.provider === p).length,
                current: provider === p,
              })),
            ]}
          />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState
            title={T.emptyTitle}
            action={
              status || provider ? (
                <ButtonLink variant="secondary" href={boHref.payments()}>
                  {T.clear}
                </ButtonLink>
              ) : undefined
            }
          >
            <p>{T.emptyHint}</p>
          </EmptyState>
        ) : (
          <>
            <Table data-testid="payment-list">
              <thead>
                <tr>
                  <th>{T.receipt}</th>
                  <th className={cell.num}>{T.date}</th>
                  <th>{T.order}</th>
                  <th>{T.customer}</th>
                  <th>{T.method}</th>
                  <th className={cell.num}>{T.amount}</th>
                  <th className={cell.num}>{T.refundable}</th>
                  <th>{T.status}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((p) => (
                  <tr key={p.id} data-payment-id={p.id}>
                    <td className={cell.code}>
                      <Link href={boHref.payment(p.id)}>
                        {p.receipt_number ?? backOfficeText.details}
                      </Link>
                    </td>
                    <td className={cell.num}>{when(p.succeeded_at ?? p.initiated_at)}</td>
                    <td className={cell.code}>
                      <Link href={boHref.order(p.order_id)}>{p.order_number}</Link>
                    </td>
                    <td className={cell.nowrap}>{p.customer_name ?? backOfficeText.none}</td>
                    <td className={cell.nowrap}>
                      {
                        billingText.paymentProvider[
                          p.provider as keyof typeof billingText.paymentProvider
                        ]
                      }
                    </td>
                    <td className={cell.num}>{money(p.amount_kurus, p.currency)}</td>
                    <td className={cell.num}>{money(p.refundable_kurus, p.currency)}</td>
                    <td>
                      <Badge labels={billingText.paymentStatus} value={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination {...page} href={pageHref} />
          </>
        )}
      </section>
    </main>
  );
}
