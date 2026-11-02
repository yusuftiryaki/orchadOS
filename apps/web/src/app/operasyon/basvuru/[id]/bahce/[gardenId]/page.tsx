import { notFound } from "next/navigation";
import { Facts, when } from "@/components/back-office/parts";
import { VerifyGardenForm } from "@/components/back-office/verify-garden-form";
import { Panel } from "@/components/ui/panel";
import { Split } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { getApplication, getGarden, userName } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { formatDonum } from "@/lib/billing/money";
import { formatNumber, t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { maskPhone } from "@/lib/notifications/phone";
import { ringAreaM2 } from "@/lib/operations/geometry";
import { speciesName } from "@/lib/species";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.garden;

// One garden of an application: what the customer declared, deed and access
// details (ops_application_garden_detail), and the verification form. The
// form and its map take the wide column (drawing needs the room); what the
// customer declared stays beside it for comparison.
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
  const verified = g.verified_area_m2 != null;

  const facts = (
    <>
      <Panel title={T.declaredTitle}>
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
              verified ? formatDonum(Number(g.verified_area_m2)) : B.application.notVerified,
            ],
            [T.verifiedBy, userName(internal.verified_by) ?? B.none],
            [T.verificationNote, (internal.verification_note as string | null) ?? B.none],
            [T.species, speciesName(g.species)],
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
      </Panel>
      <Panel title={T.detail}>
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
              [T.siteContactName, detail.site_contact_name],
              [T.siteContactPhone, maskPhone(detail.site_contact_phone) || null],
            ]}
          />
        ) : (
          <p className="muted">{B.none}</p>
        )}
      </Panel>
    </>
  );

  return (
    <main className="page">
      <PageHeader
        title={T.title(g.name)}
        back={{
          href: boHref.application(id),
          label: app.application.number
            ? B.application.title(app.application.number)
            : B.application.draftTitle,
        }}
        meta={
          <Badge tone={verified ? "success" : "warning"}>
            {verified ? T.verifiedBadge : B.application.notVerified}
          </Badge>
        }
      />
      {open ? (
        <Split aside={facts}>
          <Panel title={T.verifyTitle} description={T.verifyHint}>
            <VerifyGardenForm
              applicationId={id}
              gardenId={g.id}
              position={g.position}
              boundary={g.boundary}
              initialDonum={
                verified
                  ? formatNumber(Number(g.verified_area_m2) / 1000, 3).replace(/\./g, "")
                  : ""
              }
            />
          </Panel>
        </Split>
      ) : (
        facts
      )}
    </main>
  );
}
