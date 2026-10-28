import { CustomerList, type CustomerSource } from "@/components/back-office/customer-list";
import { customerListView } from "@/components/back-office/customer-rows";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
// paid amount; a search and a sign-up source filter. Personal data: ops
// only, phones masked, and the search term is posted (searchCustomersAction),
// never put in the URL.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const kaynak = firstParam(params.kaynak);
  const source: CustomerSource = kaynak === "self" || kaynak === "ops" ? kaynak : null;
  const supabase = await createClient();
  const [customers, profiles] = await Promise.all([
    opsOrgs(supabase, user.id).then((orgs) => listCustomers(supabase, orgs, null)),
    listOwnerProfiles(supabase),
  ]);
  const view = customerListView(customers, profiles, false);
  const self = view.rows.filter((r) => r.self).length;

  return (
    <main className="page">
      <PageHeader
        title={T.owners.title}
        lead={T.owners.privacy}
        actions={<ButtonLink href={opsHref.newOwner()}>{T.nav.newOwner}</ButtonLink>}
      />
      <CustomerList
        key={source ?? "all"}
        initial={view}
        source={source}
        page={params.sayfa}
        counts={{ all: view.rows.length, self, ops: view.rows.length - self }}
      />
    </main>
  );
}
