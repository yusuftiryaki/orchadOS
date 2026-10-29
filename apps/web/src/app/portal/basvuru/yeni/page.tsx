import { createApplicationAction } from "@/app/portal/billing-actions";
import { MemberBand } from "@/components/portal-billing/member-band";
import { PortalResult } from "@/components/portal-billing/result-notice";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
  const [packages, applications, { primary }, params] = await Promise.all([
    listPackagePrices(supabase),
    listApplications(supabase, user.id),
    getServicePeriods(supabase),
    searchParams,
  ]);
  const closed = !!primary && !primary.garden_changes_enabled;
  const parcels = primary && !closed ? await listPortalParcels(supabase) : [];
  const draft = applications.find((a) => a.status === "draft");
  const memberPackage = primary
    ? (packages.find((p) => p.packageId === primary.package_id) ?? null)
    : null;
  const shown = primary ? (memberPackage ? [memberPackage] : []) : packages;
  return (
    <main className={`${layout.page} ${layout.reading}`}>
      <PageHeader
        title={primary ? M.addTitle : N.title}
        lead={closed ? undefined : primary ? N.memberLead : N.lead}
        back={{ href: portalHref.applications(), label: P.applications.title }}
      />
      <PortalResult params={params} />
      {primary && !closed && <MemberBand period={primary} parcels={parcels} />}
      {draft && (
        <Alert tone="info">
          <p>{N.existingDraft}</p>
          <p>
            <ButtonLink variant="secondary" size="sm" href={portalHref.application(draft.id)}>
              {P.home.draftButton}
            </ButtonLink>
          </p>
        </Alert>
      )}
      {closed ? (
        <Alert tone="info" testId="addon-closed">
          {M.packageUnavailable}
        </Alert>
      ) : primary && !memberPackage ? (
        <Alert tone="info" testId="addon-package-unavailable">
          {M.packageUnavailable}
        </Alert>
      ) : shown.length === 0 ? (
        <Alert tone="warning">{N.noPackages}</Alert>
      ) : (
        <form action={createApplicationAction} className={s.form}>
          {/* A disabled radio is not submitted: the locked package goes here. */}
          {memberPackage && (
            <input type="hidden" name="package_id" value={memberPackage.packageId} />
          )}
          <fieldset className={s.choices}>
            <legend>{N.package}</legend>
            {shown.map((pkg, i) => (
              <label key={pkg.packageId} className={s.choice}>
                <input
                  type="radio"
                  name={memberPackage ? "package_locked" : "package_id"}
                  value={pkg.packageId}
                  defaultChecked={i === 0}
                  disabled={!!memberPackage}
                  required={!memberPackage}
                />
                <span className={s.choiceBody}>
                  <span className={s.choiceName}>{pkg.name}</span>
                  {pkg.description && <span>{pkg.description}</span>}
                  <span className={s.choiceFacts}>
                    <span>{N.visits(pkg.periodicVisitsPerYear)}</span>
                    {pkg.includesInventory && <span>{N.inventory}</span>}
                    <span>{N.unitPrice(formatKurus(pkg.unitPriceKurus, pkg.currency))}</span>
                    <span>{N.minimum(formatKurus(pkg.minimumFeeKurus, pkg.currency))}</span>
                  </span>
                </span>
              </label>
            ))}
            {memberPackage && (
              <p className={`${layout.muted} ${layout.small}`}>{M.packageLocked}</p>
            )}
          </fieldset>
          {!primary && (
            <p
              className={`${layout.muted} ${layout.small}`}
              data-testid="application-location-note"
            >
              {N.locationNote}
            </p>
          )}
          <div className={layout.actions}>
            <button className="button" type="submit">
              {primary ? N.memberSubmit : N.submit}
            </button>
            <ButtonLink variant="quiet" href={portalHref.applications()}>
              {P.cancel}
            </ButtonLink>
          </div>
        </form>
      )}
    </main>
  );
}
