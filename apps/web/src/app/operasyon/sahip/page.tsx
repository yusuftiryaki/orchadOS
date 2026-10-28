import Link from "next/link";
import { CustomerList } from "@/components/back-office/customer-list";
import { customerListView } from "@/components/back-office/customer-rows";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { listCustomers } from "@/lib/back-office/data";
import { firstParam } from "@/lib/back-office/urls";
import { t } from "@/lib/i18n";
import { listOwnerProfiles, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

// Owners, co-owners and self-service customers (private.owner_profile, through
// ops_customers): contact preference, sign-up source, open orders and the net
// paid amount; a search and a "self-service only" filter. Personal data: ops
// only, phones masked, and the search term is posted (searchCustomersAction),
// never put in the URL.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const selfOnly = firstParam(params.kaynak) === "self";
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const [customers, profiles] = await Promise.all([
    listCustomers(supabase, orgs, null),
    listOwnerProfiles(supabase),
  ]);

  return (
    <main className="page">
      <div className={styles.titleRow}>
        <h1>{T.owners.title}</h1>
        <Link className="button" href={opsHref.newOwner()}>
          {T.nav.newOwner}
        </Link>
      </div>
      <p className={styles.privacy}>{T.owners.privacy}</p>
      <CustomerList initial={customerListView(customers, profiles, selfOnly)} selfOnly={selfOnly} />
    </main>
  );
}
