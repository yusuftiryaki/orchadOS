import Link from "next/link";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { money } from "@/components/back-office/parts";
import { requireSection } from "@/lib/auth/session";
import { listCustomers } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { maskPhone } from "@/lib/notifications/phone";
import { listOwnerProfiles, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;
const C = backOfficeText.customers;

// Owners, co-owners and self-service customers (private.owner_profile, through
// ops_customers): sign-up source, open orders and the net paid amount; a
// search and a "self-service only" filter. Personal data: ops only, phones
// masked.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const query = (firstParam(params.q) ?? "").trim().slice(0, 100) || null;
  const selfOnly = firstParam(params.kaynak) === "self";
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const [customers, profiles] = await Promise.all([
    listCustomers(supabase, orgs, query),
    listOwnerProfiles(supabase),
  ]);
  const consent = new Map(profiles.map((p) => [p.id, p]));
  const rows = customers.filter((c) => !selfOnly || c.signup_source === "self");

  return (
    <main className="page">
      <OpsNav current="owners" />
      <div className={styles.titleRow}>
        <h1>{T.owners.title}</h1>
        <Link className="button" href={opsHref.newOwner()}>
          {T.nav.newOwner}
        </Link>
      </div>
      <p className={styles.privacy}>{T.owners.privacy}</p>
      <form className={styles.inline} action={boHref.customers()} data-testid="owner-filter">
        <label>
          {C.search}
          <input type="search" name="q" defaultValue={query ?? ""} maxLength={100} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="kaynak" value="self" defaultChecked={selfOnly} />
          {C.selfOnly}
        </label>
        <button className="button button-secondary" type="submit">
          {backOfficeText.filter}
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="muted">{query || selfOnly ? C.empty : T.owners.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="owner-list">
            <thead>
              <tr>
                <th>{T.columns.name}</th>
                <th>{T.columns.phone}</th>
                <th>{C.source}</th>
                <th className={styles.number}>{C.parcels}</th>
                <th className={styles.number}>{C.openOrders}</th>
                <th className={styles.number}>{C.paid}</th>
                <th>{T.columns.kvkk}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const p = consent.get(c.profile_id);
                return (
                  <tr key={c.profile_id} data-profile-id={c.profile_id}>
                    <td>
                      <Link href={opsHref.owner(c.profile_id)}>{c.full_name}</Link>
                    </td>
                    <td>{maskPhone(c.phone)}</td>
                    <td>
                      <span className={styles.badge} data-source={c.signup_source}>
                        {c.signup_source === "self" ? C.sourceSelf : C.sourceOps}
                      </span>
                    </td>
                    <td className={styles.number}>{formatNumber(c.parcel_count)}</td>
                    <td className={styles.number}>{formatNumber(c.open_order_count)}</td>
                    <td className={styles.number}>{money(c.paid_kurus)}</td>
                    <td>
                      {p?.kvkk_consent && p.kvkk_consent_at
                        ? T.owners.consentYes(
                            formatDate(p.kvkk_consent_at),
                            p.kvkk_text_version ?? "",
                          )
                        : T.owners.consentNo}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
