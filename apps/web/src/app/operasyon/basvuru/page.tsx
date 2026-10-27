import Link from "next/link";
import { Badge, day } from "@/components/back-office/parts";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { listApplications } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { formatDonum } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const T = backOfficeText.applications;
const STATUSES = ["submitted", "quoted", "accepted", "rejected", "withdrawn"] as const;

// Customer applications (ops_applications): all but drafts, or one status.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const status = pick((await searchParams).durum, STATUSES);
  const supabase = await createClient();
  const rows = await listApplications(supabase, await opsOrgs(supabase, user.id), status);

  return (
    <main className="page">
      <OpsNav current="applications" />
      <h1>{T.title}</h1>
      <nav className={styles.inline} aria-label={T.status}>
        <Link href={boHref.applications()} aria-current={!status ? "page" : undefined}>
          {backOfficeText.all}
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={boHref.applications({ durum: s })}
            aria-current={status === s ? "page" : undefined}
          >
            {billingText.applicationStatus[s]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="application-list">
            <thead>
              <tr>
                <th>{T.number}</th>
                <th>{T.customer}</th>
                <th>{T.package}</th>
                <th className={styles.number}>{T.gardens}</th>
                <th className={styles.number}>{T.declaredArea}</th>
                <th className={styles.number}>{T.verified}</th>
                <th>{T.submittedAt}</th>
                <th>{T.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} data-application-id={a.id}>
                  <td>
                    <Link href={boHref.application(a.id)}>{a.number ?? a.id.slice(0, 8)}</Link>
                  </td>
                  <td>{a.customer_name ?? backOfficeText.none}</td>
                  <td>{a.package_name ?? backOfficeText.none}</td>
                  <td className={styles.number}>{a.garden_count}</td>
                  <td className={styles.number}>{formatDonum(Number(a.declared_area_m2))}</td>
                  <td className={styles.number}>
                    {T.verifiedOf(a.verified_garden_count, a.garden_count)}
                  </td>
                  <td>{day(a.submitted_at)}</td>
                  <td>
                    <Badge labels={billingText.applicationStatus} value={a.status} />
                    {a.open_quote_id && (
                      <>
                        {" "}
                        <Link href={boHref.quote(a.open_quote_id)}>{T.openQuote}</Link>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
