import Link from "next/link";
import { createDraftAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import {
  Badge,
  BoResultNotice,
  OrgPicker,
  Submit,
  day,
  when,
} from "@/components/back-office/parts";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, getPrices } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { bpToPercent } from "@/lib/back-office/validation";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.prices;

// Packages and price list versions; the list in force today is marked.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const org = chooseOrg(orgs, firstParam(query.org));
  const today = todayIn(new Date());
  const prices = org ? await getPrices(supabase, org.id, today) : null;

  return (
    <main className="page">
      <h1>{T.title}</h1>
      {org && <OrgPicker orgs={orgs} current={org.id} action={boHref.prices()} />}
      <BoResultNotice params={query} />
      {org && prices && (
        <>
          <div className={styles.titleRow}>
            <h2>{T.packages}</h2>
            <Link className="button button-secondary" href={boHref.packageForm(undefined, org.id)}>
              {T.newPackage}
            </Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="package-list">
              <thead>
                <tr>
                  <th>{T.code}</th>
                  <th>{T.name}</th>
                  <th className={styles.number}>{T.visits}</th>
                  <th>{T.inventory}</th>
                  <th>{T.status}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {prices.packages.map((p) => (
                  <tr key={p.id} data-package-code={p.code}>
                    <td>{p.code}</td>
                    <td>{p.name}</td>
                    <td className={styles.number}>{p.periodic_visits_per_year}</td>
                    <td>{p.includes_inventory ? B.yes : B.no}</td>
                    <td>{p.active ? T.active : T.passive}</td>
                    <td>
                      <Link href={boHref.packageForm(p.id)}>{T.edit}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.titleRow}>
            <h2>{T.lists}</h2>
            <ActionForm action={createDraftAction} inline testId="new-draft">
              <input type="hidden" name="org_id" value={org.id} />
              <Submit secondary>{T.newDraft}</Submit>
            </ActionForm>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="price-lists">
              <thead>
                <tr>
                  <th>{T.version}</th>
                  <th>{T.status}</th>
                  <th>{T.validFrom}</th>
                  <th className={styles.number}>{T.vat}</th>
                  <th>{T.publishedAt}</th>
                  <th>{T.note}</th>
                </tr>
              </thead>
              <tbody>
                {prices.lists.map((l) => (
                  <tr
                    key={l.id}
                    data-price-list-id={l.id}
                    data-in-force={l.id === prices.inForceId || undefined}
                  >
                    <td>
                      <Link href={boHref.priceList(l.id)}>{T.listTitle(l.version)}</Link>
                    </td>
                    <td>
                      <Badge labels={billingText.priceListStatus} value={l.status} />
                      {l.id === prices.inForceId && (
                        <span className={styles.badge}> {T.inForce}</span>
                      )}
                    </td>
                    <td>{day(l.valid_from)}</td>
                    <td className={styles.number}>%{bpToPercent(l.vat_rate_bp)}</td>
                    <td>{when(l.published_at)}</td>
                    <td>{l.note ?? B.none}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
