import Link from "next/link";
import { createApplicationAction } from "@/app/portal/billing-actions";
import { MemberBand } from "@/components/portal-billing/member-band";
import { PortalResult } from "@/components/portal-billing/result-notice";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatKurus } from "@/lib/billing/money";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getServicePeriods, listApplications, listPackagePrices } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { listPortalParcels } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

const N = P.newApplication;
const M = P.membership;

// A new application draft: the package first (customer_create_application
// returns the open draft if there is one). A member (IP14,
// docs/bahce-yonetimi.md §4.1) adds gardens to the membership: the package is
// the membership's, shown locked; if it is no longer offered, or garden
// changes are closed (garden_changes_enabled, §2), the team is asked instead.
export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  const [packages, applications, { primary }] = await Promise.all([
    listPackagePrices(supabase),
    listApplications(supabase, user.id),
    getServicePeriods(supabase),
  ]);
  const closed = !!primary && !primary.garden_changes_enabled;
  const parcels = primary && !closed ? await listPortalParcels(supabase) : [];
  const draft = applications.find((a) => a.status === "draft");
  const memberPackage = primary
    ? (packages.find((p) => p.packageId === primary.package_id) ?? null)
    : null;
  const shown = primary ? (memberPackage ? [memberPackage] : []) : packages;
  return (
    <main className={styles.page}>
      <h1>{primary ? M.addTitle : N.title}</h1>
      <PortalResult params={await searchParams} />
      {primary && !closed && <MemberBand period={primary} parcels={parcels} />}
      {!closed && <p>{primary ? N.memberLead : N.lead}</p>}
      {draft && (
        <p className={ops.notice}>
          {N.existingDraft}{" "}
          <Link href={portalHref.application(draft.id)}>{P.home.draftButton}</Link>
        </p>
      )}
      {closed ? (
        <p className={ops.notice} data-testid="addon-closed">
          {M.packageUnavailable}
        </p>
      ) : primary && !memberPackage ? (
        <p className={ops.notice} data-testid="addon-package-unavailable">
          {M.packageUnavailable}
        </p>
      ) : shown.length === 0 ? (
        <p className={ops.notice}>{N.noPackages}</p>
      ) : (
        <form action={createApplicationAction} className={ops.form}>
          {/* A disabled radio is not submitted: the locked package goes here. */}
          {memberPackage && (
            <input type="hidden" name="package_id" value={memberPackage.packageId} />
          )}
          <fieldset className={ops.fieldset}>
            <legend>{N.package}</legend>
            {shown.map((pkg, i) => (
              <label key={pkg.packageId} className={ops.check}>
                <input
                  type="radio"
                  name={memberPackage ? "package_locked" : "package_id"}
                  value={pkg.packageId}
                  defaultChecked={i === 0}
                  disabled={!!memberPackage}
                  required={!memberPackage}
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
            {memberPackage && <p className="muted">{M.packageLocked}</p>}
          </fieldset>
          <div className={ops.actions}>
            <button className="button" type="submit">
              {primary ? N.memberSubmit : N.submit}
            </button>
            <Link href={portalHref.applications()}>{P.cancel}</Link>
          </div>
        </form>
      )}
    </main>
  );
}
