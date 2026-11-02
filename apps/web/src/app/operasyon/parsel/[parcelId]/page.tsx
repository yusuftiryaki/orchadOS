import Link from "next/link";
import { notFound } from "next/navigation";
import {
  grantAccessAction,
  revokeAccessAction,
  setParcelPassiveAction,
} from "@/app/operasyon/actions";
import { Badge, Facts, day } from "@/components/back-office/parts";
import { statusTone } from "@/components/ui/status";
import { BoundaryDispute } from "@/components/operations/boundary-dispute";
import { BoundaryPointers } from "@/components/operations/boundary-pointers";
import { Field } from "@/components/operations/field";
import { LegalNotice } from "@/components/operations/legal-notice";
import { MediaSuppression } from "@/components/operations/media-suppression";
import styles from "@/components/operations/operations.module.css";
import { Panel } from "@/components/ui/panel";
import { Split } from "@/components/ui/layout";
import { ResultNotice } from "@/components/operations/result-notice";
import { VisitTable } from "@/components/operations/visit-table";
import { ParcelDetail } from "@/components/parcel-detail";
import { Alert } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Consequence } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { Table } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { parcelService } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import {
  getParcelOps,
  listFieldStaff,
  listOwnerProfiles,
  listVisits,
  opsOrgs,
} from "@/lib/operations/data";
import { m2ToDonum } from "@/lib/operations/geometry";
import { disputeStatus, listBoundaryPointers, listSuppressions } from "@/lib/operations/legal";
import { createMediaSigner } from "@/lib/media/signer";
import { ParcelServices } from "@/components/operations/parcel-services";
import { getRobotNote, parcelServiceRequests } from "@/lib/operations/service-data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";
import local from "./parcel.module.css";

const T = t.operations;
const S = backOfficeText.service;

// The operations view of a parcel, around the shared parcel map: its actions,
// the parcel and its private record, service, portal access and visits on
// the left; life cycle and the boundary dispute on the right.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const ops = await getParcelOps(supabase, parcelId);
  if (!ops) notFound();
  const { parcel, detail, access, boundary } = ops;

  const orgsP = opsOrgs(supabase, user.id);
  // Legal follow-ups (T20): hidden images of the parcel's visits (ops only).
  const suppressionsP = orgsP.then(async (orgs) => {
    if (!orgs.some((o) => o.id === parcel.org_id)) return null;
    const records = await listSuppressions(supabase, { parcelId });
    const urls = await createMediaSigner(supabase, { scope: user.id }).signUrls(
      records.map((r) => r.uri),
    );
    return { records, urls };
  });
  const [
    orgs,
    profiles,
    visits,
    service,
    pointers,
    dispute,
    staff,
    suppressions,
    serviceRequests,
    robotNote,
  ] = await Promise.all([
    orgsP,
    listOwnerProfiles(supabase),
    listVisits(supabase, { parcelId }),
    parcelService(supabase, parcel.org_id, parcelId),
    listBoundaryPointers(supabase, parcelId),
    disputeStatus(supabase, parcelId),
    orgsP.then((o) => listFieldStaff(supabase, o)),
    suppressionsP,
    // IP15: weed mowing requests and the robot suitability note.
    parcelServiceRequests(supabase, parcelId),
    getRobotNote(supabase, parcelId),
  ]);
  const covering = service.garden;
  const isOps = orgs.some((o) => o.id === parcel.org_id);
  const leads = new Map(staff.map((s) => [s.userId, s.email]));
  const withAccess = new Set(access.map((a) => a.user_id));
  const candidates = profiles.filter(
    (p) => p.org_id === parcel.org_id && !withAccess.has(p.user_id),
  );
  const passive = parcel.status === "passive";

  const yesNo = (v: boolean | null) => (v == null ? T.unknown : v ? T.yes : T.no);
  type Row = [string, React.ReactNode];

  const serviceRows: Row[] = [
    [
      S.status,
      <Badge
        key="s"
        labels={billingText.parcelServiceStatus}
        value={service.status?.status ?? "none"}
      />,
    ],
    ...(service.status?.leaving_on ? [[S.leavingOn, day(service.status.leaving_on)] as Row] : []),
    ...(service.status?.removed_on ? [[S.removedOn, day(service.status.removed_on)] as Row] : []),
    ...(service.status?.access_until
      ? [[S.accessUntil, day(service.status.access_until)] as Row]
      : []),
    [
      S.order,
      covering?.order_id ? (
        <Link key="o" href={boHref.order(covering.order_id)}>
          {covering.order_number}
        </Link>
      ) : (
        <span key="o" data-testid="parcel-service-pilot">
          {S.pilot}
        </span>
      ),
    ],
    ...(covering
      ? ([
          [
            S.customer,
            covering.profileId ? (
              <Link key="c" href={boHref.customer(covering.profileId)}>
                {covering.customerName ?? S.customer}
              </Link>
            ) : (
              covering.customerName
            ),
          ],
          [
            S.period,
            `${day(covering.service_start)} – ${day(covering.removed_on ?? covering.service_end)}`,
          ],
        ] as Row[])
      : []),
    ...(service.openRemoval
      ? [
          [
            S.removal,
            <span key="r">
              <Link href={boHref.removal(service.openRemoval.id)} data-testid="parcel-open-removal">
                {service.openRemoval.number}
              </Link>{" "}
              <span className="muted">
                (
                {day(
                  service.openRemoval.effective_on ?? service.openRemoval.requested_effective_on,
                )}
                )
              </span>
            </span>,
          ] as Row,
        ]
      : []),
  ];

  const actions = (
    <>
      <div className={local.actions} role="group" aria-label={T.parcel.actions}>
        <ButtonLink href={opsHref.newVisit(parcel.id)}>{T.visits.planForParcel}</ButtonLink>
        <ButtonLink variant="secondary" href={opsHref.boundary(parcel.id)}>
          {boundary ? T.parcel.redrawBoundary : T.parcel.drawBoundary}
        </ButtonLink>
        <ButtonLink variant="secondary" href={opsHref.editParcel(parcel.id)}>
          {T.parcel.edit}
        </ButtonLink>
      </div>
      <ResultNotice params={query} />
      <LegalNotice params={query} />

      <Split
        aside={
          <>
            <Panel title={T.parcel.lifecycle} testId="parcel-lifecycle-panel">
              <p>
                <UiBadge tone={statusTone(parcel.status)} testId="parcel-status">
                  {t.parcels.status[parcel.status]}
                </UiBadge>
              </p>
              <form
                action={setParcelPassiveAction}
                data-testid="parcel-lifecycle"
                className={styles.form}
              >
                <input type="hidden" name="parcel_id" value={parcel.id} />
                <input type="hidden" name="passive" value={passive ? "0" : "1"} />
                <Consequence>{T.parcel.passiveHint}</Consequence>
                <div className={styles.actions}>
                  <Button variant={passive ? "secondary" : "danger"} type="submit">
                    {passive ? T.parcel.resume : T.parcel.setPassive}
                  </Button>
                </div>
              </form>
            </Panel>
            {isOps && <BoundaryDispute parcelId={parcel.id} status={dispute} />}
          </>
        }
      >
        <Panel title={T.parcel.publicSection} testId="parcel-info">
          <Facts
            rows={[
              [
                t.parcels.columns.location,
                [parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ") ||
                  null,
              ],
              [
                t.parcels.columns.area,
                parcel.estimated_area_m2 != null
                  ? `${formatNumber(parcel.estimated_area_m2)} m² (${formatNumber(m2ToDonum(parcel.estimated_area_m2), 1)} dönüm)`
                  : null,
              ],
              [T.parcel.irrigation, T.irrigation[parcel.irrigation]],
              [
                t.parcels.columns.trees,
                parcel.estimated_tree_count != null
                  ? formatNumber(parcel.estimated_tree_count)
                  : null,
              ],
              [
                T.parcel.position,
                parcel.position
                  ? `${parcel.position[1].toFixed(5)}, ${parcel.position[0].toFixed(5)} (±${formatNumber(parcel.position_uncertainty_m ?? 0)} m)`
                  : null,
              ],
              [
                T.parcel.boundary,
                <span key="b" data-testid="parcel-boundary">
                  {boundary
                    ? T.parcel.boundaryVersion(
                        boundary.version,
                        T.parcel.boundarySource[
                          boundary.source as keyof typeof T.parcel.boundarySource
                        ] ?? boundary.source,
                      )
                    : T.parcel.noBoundary}
                </span>,
              ],
            ]}
          />
          {boundary && (
            <Alert tone="warning">
              <p>{T.parcel.boundaryNote}</p>
            </Alert>
          )}
        </Panel>

        <Panel
          title={T.parcel.privateTitle}
          description={T.parcel.privateHint}
          testId="parcel-private"
        >
          {!detail ? (
            <EmptyState
              compact
              headingLevel={3}
              title={T.parcel.noDetail}
              action={
                <ButtonLink variant="secondary" size="sm" href={opsHref.editParcel(parcel.id)}>
                  {T.parcel.edit}
                </ButtonLink>
              }
            />
          ) : (
            <Facts
              rows={[
                [
                  `${T.parcel.deedBlock} / ${T.parcel.deedParcel}`,
                  [detail.deed_block, detail.deed_parcel].filter(Boolean).join(" / ") || null,
                ],
                [T.parcel.sharedDeed, yesNo(detail.is_shared_deed)],
                [T.parcel.usedPortion, detail.used_portion_note],
                [
                  T.parcel.authorizationBasis,
                  detail.authorization_basis
                    ? T.authorizationBasis[
                        detail.authorization_basis as keyof typeof T.authorizationBasis
                      ]
                    : null,
                ],
                [
                  T.parcel.entryPermissionAt,
                  detail.entry_permission_at ? formatDate(detail.entry_permission_at) : null,
                ],
                [T.parcel.accessNote, detail.access_note],
                [
                  T.parcel.siteContactName,
                  [detail.site_contact_name, detail.site_contact_phone]
                    .filter(Boolean)
                    .join(", ") || null,
                ],
              ]}
            />
          )}
        </Panel>

        <Panel title={S.title} testId="parcel-service">
          <Facts rows={serviceRows} />
        </Panel>

        <ParcelServices
          parcelId={parcel.id}
          requests={serviceRequests}
          robotNote={robotNote}
          params={query}
        />

        <Panel title={T.access.title} id="erisim" testId="parcel-access">
          {access.length === 0 ? (
            <EmptyState compact headingLevel={3} title={T.access.empty} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{T.columns.name}</th>
                  <th>{T.columns.account}</th>
                  <th>{T.columns.role}</th>
                  <th>
                    <span className="sr-only">{T.access.revoke}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {access.map((a) => (
                  <tr key={a.id} data-access-role={a.role}>
                    <td>
                      {a.profile_id ? (
                        <Link href={opsHref.owner(a.profile_id)}>{a.full_name}</Link>
                      ) : (
                        <span className="muted">{T.access.noProfile}</span>
                      )}
                    </td>
                    <td>{a.email ?? "—"}</td>
                    <td>{T.parcelRole[a.role]}</td>
                    <td>
                      <form action={revokeAccessAction}>
                        <input type="hidden" name="parcel_id" value={parcel.id} />
                        <input type="hidden" name="access_id" value={a.id} />
                        <Button variant="danger" size="sm" type="submit">
                          {T.access.revoke}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <form action={grantAccessAction} className={styles.formRow} data-testid="grant-access">
            <input type="hidden" name="parcel_id" value={parcel.id} />
            <Field label={T.access.person}>
              <select name="profile_id" defaultValue="">
                <option value="">{T.access.choosePerson}</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T.access.orEmail}>
              <input name="email" type="email" autoComplete="off" />
            </Field>
            <Field label={T.access.role}>
              <select
                name="role"
                defaultValue={access.some((a) => a.role === "owner") ? "viewer" : "owner"}
              >
                <option value="owner">{T.parcelRole.owner}</option>
                <option value="viewer">{T.parcelRole.viewer}</option>
              </select>
            </Field>
            <Button variant="secondary" type="submit">
              {T.access.grant}
            </Button>
          </form>
          <p className={styles.formNote}>{T.access.emailHint}</p>
        </Panel>

        <Panel plain title={T.visits.parcelVisits} testId="parcel-visits">
          {visits.length === 0 ? (
            <EmptyState compact headingLevel={3} title={T.visits.noVisits} />
          ) : (
            <VisitTable visits={visits} leads={leads} showParcel={false} />
          )}
        </Panel>

        <BoundaryPointers pointers={pointers} />
        {suppressions && (
          <MediaSuppression
            back={opsHref.parcel(parcel.id)}
            records={suppressions.records}
            urls={suppressions.urls}
          />
        )}
      </Split>
    </>
  );

  return <ParcelDetail section="operasyon" parcelId={parcelId} actions={actions} />;
}
