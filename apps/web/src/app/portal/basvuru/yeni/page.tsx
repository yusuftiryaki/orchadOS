import Link from "next/link";
import { createApplicationAction } from "@/app/portal/billing-actions";
import { PortalResult } from "@/components/portal-billing/result-notice";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatKurus } from "@/lib/billing/money";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { listApplications, listPackagePrices } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const N = P.newApplication;

// A new application draft: the package first (customer_create_application
// returns the open draft if there is one).
export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [packages, applications] = await Promise.all([
    listPackagePrices(supabase),
    listApplications(supabase, user.id),
  ]);
  const draft = applications.find((a) => a.status === "draft");
  return (
    <main className={styles.page}>
      <h1>{N.title}</h1>
      <PortalResult params={await searchParams} />
      <p>{N.lead}</p>
      {draft && (
        <p className={ops.notice}>
          {N.existingDraft}{" "}
          <Link href={portalHref.application(draft.id)}>{P.home.draftButton}</Link>
        </p>
      )}
      {packages.length === 0 ? (
        <p className={ops.notice}>{N.noPackages}</p>
      ) : (
        <form action={createApplicationAction} className={ops.form}>
          <fieldset className={ops.fieldset}>
            <legend>{N.package}</legend>
            {packages.map((pkg, i) => (
              <label key={pkg.packageId} className={ops.check}>
                <input
                  type="radio"
                  name="package_id"
                  value={pkg.packageId}
                  defaultChecked={i === 0}
                  required
                />
                <span>
                  <strong>{pkg.name}</strong>
                  {pkg.description && <> · {pkg.description}</>}
                  <br />
                  <span className="muted">
                    {N.visits(pkg.periodicVisitsPerYear)}
                    {pkg.includesInventory && ` · ${N.inventory}`} ·{" "}
                    {N.unitPrice(formatKurus(pkg.unitPriceKurus, pkg.currency))} ·{" "}
                    {N.minimum(formatKurus(pkg.minimumFeeKurus, pkg.currency))}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className={ops.actions}>
            <button className="button" type="submit">
              {N.submit}
            </button>
            <Link href={portalHref.applications()}>{P.cancel}</Link>
          </div>
        </form>
      )}
    </main>
  );
}
