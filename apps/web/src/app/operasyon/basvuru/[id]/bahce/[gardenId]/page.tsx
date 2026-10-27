import Link from "next/link";
import { notFound } from "next/navigation";
import { Facts, when } from "@/components/back-office/parts";
import { VerifyGardenForm } from "@/components/back-office/verify-garden-form";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { getApplication, getGarden, userName } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { formatDonum } from "@/lib/billing/money";
import { formatNumber, t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { maskPhone } from "@/lib/notifications/phone";
import { ringAreaM2 } from "@/lib/operations/geometry";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.garden;

// One garden of an application: what the customer declared, deed and access
// details (ops_application_garden_detail), and the verification form.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; gardenId: string }>;
}) {
  await requireSection("operasyon");
  const { id, gardenId } = await params;
  const supabase = await createClient();
  const [view, app] = await Promise.all([
    getGarden(supabase, gardenId),
    getApplication(supabase, id),
  ]);
  if (!view || !app || view.garden.application_id !== id) notFound();
  const { garden: g, detail, internal } = view;
  const open = app.application.status === "submitted" || app.application.status === "quoted";
  const yes = (v: boolean | null | undefined) => (v ? B.yes : B.no);

  return (
    <main className="page">
      <OpsNav current="applications" />
      <p>
        <Link href={boHref.application(id)}>
          ←{" "}
          {app.application.number
            ? B.application.title(app.application.number)
            : B.application.draftTitle}
        </Link>
      </p>
      <h1>{T.title(g.name)}</h1>
      <div className={styles.columns}>
        <section className={styles.section}>
          <Facts
            testId="garden-facts"
            rows={[
              [
                B.application.location,
                [g.village, g.district, g.province].filter(Boolean).join(", "),
              ],
              [T.declared, formatDonum(Number(g.declared_area_m2))],
              ...(g.boundary && g.boundary.length >= 3
                ? ([[T.boundaryArea, formatDonum(ringAreaM2(g.boundary))]] as [string, string][])
                : []),
              [
                T.verified,
                g.verified_area_m2 != null
                  ? formatDonum(Number(g.verified_area_m2))
                  : B.application.notVerified,
              ],
              [T.verifiedBy, userName(internal.verified_by) ?? B.none],
              [T.verificationNote, (internal.verification_note as string | null) ?? B.none],
              [T.irrigation, g.irrigation ? t.operations.irrigation[g.irrigation] : B.none],
              [
                T.trees,
                g.estimated_tree_count != null ? formatNumber(g.estimated_tree_count) : B.none,
              ],
              [
                T.uncertainty,
                g.position_uncertainty_m != null
                  ? `${formatNumber(Number(g.position_uncertainty_m))} m`
                  : B.none,
              ],
            ]}
          />
          <h2>{T.detail}</h2>
          {detail ? (
            <Facts
              rows={[
                [
                  T.authorization,
                  t.operations.authorizationBasis[
                    detail.authorization_basis as keyof typeof t.operations.authorizationBasis
                  ] ?? detail.authorization_basis,
                ],
                [
                  T.deed,
                  [detail.deed_block, detail.deed_parcel].filter(Boolean).join(" / ") || B.none,
                ],
                [T.sharedDeed, yes(detail.is_shared_deed)],
                [T.usedPortion, detail.used_portion_note],
                [T.entryPermission, when(detail.entry_permission_at)],
                [T.accessNote, detail.access_note],
                [
                  T.siteContact,
                  [detail.site_contact_name, maskPhone(detail.site_contact_phone)]
                    .filter(Boolean)
                    .join(" · ") || B.none,
                ],
              ]}
            />
          ) : (
            <p className="muted">{B.none}</p>
          )}
        </section>
        {open && (
          <section className={styles.section}>
            <h2>{T.verifyTitle}</h2>
            <p className="muted">{T.verifyHint}</p>
            <VerifyGardenForm
              applicationId={id}
              gardenId={g.id}
              position={g.position}
              boundary={g.boundary}
              initialDonum={
                g.verified_area_m2 != null
                  ? formatNumber(Number(g.verified_area_m2) / 1000, 3).replace(/\./g, "")
                  : ""
              }
            />
          </section>
        )}
      </div>
    </main>
  );
}
