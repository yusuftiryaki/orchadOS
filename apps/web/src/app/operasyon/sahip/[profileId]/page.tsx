import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerAccountPanel, RemoveAllGardens } from "@/components/back-office/customer-account";
import { Panel, Split, opsCell } from "@/components/operations/ops-ui";
import { OwnerForm } from "@/components/operations/owner-form";
import { ResultNotice } from "@/components/operations/result-notice";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { customerAccount, getSetting, membershipOrEmpty } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { formatDate, t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { accessOfUser, getOwnerProfile, opsOrgs } from "@/lib/operations/data";
import { getKvkkVersions } from "@/lib/operations/kvkk-versions";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

// One owner or customer: the parcels they reach and the customer account on
// the left; the correction of their details and "remove all gardens" on the
// right.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const { profileId } = await params;
  const supabase = await createClient();
  // The orgs and the KVKK versions do not wait for the profile.
  const orgsP = opsOrgs(supabase, user.id);
  const kvkkP = getKvkkVersions(supabase);
  const profile = await getOwnerProfile(supabase, profileId);
  // Not an ops of the profile's org looks the same as not existing.
  if (!profile) notFound();
  const [orgs, access, account, membership, setting, kvkkVersions, query] = await Promise.all([
    orgsP,
    accessOfUser(supabase, profile.user_id),
    customerAccount(supabase, profile.org_id, profile.user_id),
    membershipOrEmpty(supabase, profile.org_id, profile.user_id),
    getSetting(supabase, profile.org_id),
    kvkkP,
    searchParams,
  ]);
  const today = todayIn(new Date());
  const kvkk = profile.kvkk_consent && profile.kvkk_consent_at;

  return (
    <main className="page">
      <PageHeaderBlock
        name={profile.full_name}
        profileId={profile.id}
        kvkkAt={kvkk ? profile.kvkk_consent_at : null}
      />
      <ResultNotice params={query} />
      <Split
        aside={
          <>
            <Panel title={T.owners.editTitle}>
              <OwnerForm
                orgs={orgs}
                profileId={profile.id}
                today={today}
                kvkkVersions={kvkkVersions}
                initial={{
                  full_name: profile.full_name,
                  phone: profile.phone ?? "",
                  email: profile.email ?? "",
                  contact_preference: profile.contact_preference,
                  kvkk_consent: profile.kvkk_consent,
                  kvkk_consent_at: profile.kvkk_consent_at?.slice(0, 10) ?? "",
                  kvkk_text_version: profile.kvkk_text_version ?? "",
                }}
              />
            </Panel>
            <RemoveAllGardens
              orgId={profile.org_id}
              userId={profile.user_id}
              membership={membership}
              today={today}
              settingAccessDays={setting?.removal_access_days ?? 90}
            />
          </>
        }
      >
        <Panel plain title={T.owners.parcelsTitle}>
          {access.length === 0 ? (
            <p className="muted">{T.owners.noParcels}</p>
          ) : (
            <Table data-testid="owner-parcels">
              <thead>
                <tr>
                  <th>{T.columns.parcel}</th>
                  <th>{T.owners.accessRole}</th>
                </tr>
              </thead>
              <tbody>
                {access.map((a) => (
                  <tr key={a.parcelId}>
                    <td className={opsCell.nowrap}>
                      <Link href={opsHref.parcel(a.parcelId)}>{a.parcelName}</Link>
                    </td>
                    <td>{T.parcelRole[a.role]}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <CustomerAccountPanel
          orgId={profile.org_id}
          userId={profile.user_id}
          account={account}
          membership={membership}
        />
      </Split>
    </main>
  );
}

function PageHeaderBlock({
  name,
  profileId,
  kvkkAt,
}: {
  name: string;
  profileId: string;
  kvkkAt: string | null;
}) {
  return (
    <PageHeader
      title={name}
      back={{ href: opsHref.owners(), label: T.owners.title }}
      lead={T.owners.privacy}
      meta={
        kvkkAt ? (
          <Badge tone="success">{T.owners.kvkkGiven(formatDate(kvkkAt))}</Badge>
        ) : (
          <Badge tone="warning">{T.owners.kvkkMissing}</Badge>
        )
      }
      actions={
        <>
          <ButtonLink variant="secondary" href={opsHref.newParcel(profileId)}>
            {T.owners.addParcel}
          </ButtonLink>
          <ButtonLink variant="secondary" href={boHref.newQuote({ sahip: profileId })}>
            {backOfficeText.account.parcelQuote}
          </ButtonLink>
        </>
      }
    />
  );
}
