import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { OwnerForm } from "@/components/operations/owner-form";
import { ResultNotice } from "@/components/operations/result-notice";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { accessOfUser, getOwnerProfile, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

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
  const profile = await getOwnerProfile(supabase, profileId);
  // Not an ops of the profile's org looks the same as not existing.
  if (!profile) notFound();
  const [orgs, access] = await Promise.all([
    opsOrgs(supabase, user.id),
    accessOfUser(supabase, profile.user_id),
  ]);

  return (
    <main className="page">
      <OpsNav current="owners" />
      <p>
        <Link href={opsHref.owners()}>← {T.owners.title}</Link>
      </p>
      <h1>{profile.full_name}</h1>
      <ResultNotice params={await searchParams} />
      <p className={styles.privacy}>{T.owners.privacy}</p>
      <div className={styles.columns}>
        <section className={styles.section}>
          <h2>{T.owners.parcelsTitle}</h2>
          {access.length === 0 ? (
            <p className="muted">{T.owners.noParcels}</p>
          ) : (
            <ul data-testid="owner-parcels">
              {access.map((a) => (
                <li key={a.parcelId}>
                  <Link href={opsHref.parcel(a.parcelId)}>{a.parcelName}</Link> ·{" "}
                  {T.parcelRole[a.role]}
                </li>
              ))}
            </ul>
          )}
          <Link className="button" href={opsHref.newParcel(profile.id)}>
            {T.owners.addParcel}
          </Link>
        </section>
        <section className={styles.section}>
          <h2>{T.owners.editTitle}</h2>
          <OwnerForm
            orgs={orgs}
            profileId={profile.id}
            today={todayIn(new Date())}
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
        </section>
      </div>
    </main>
  );
}
