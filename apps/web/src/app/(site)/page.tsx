import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import ls from "@/components/site/landing.module.css";
import { LEGEND, legendText, OrchardPlate } from "@/components/site/orchard-plate";
import styles from "@/components/site/site.module.css";
import { ClassDot } from "@/components/ui/badge";
import { defaultSection } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { completeSignup, SIGNUP_REFUSED_PATH } from "@/lib/signup/client";
import { readTicket } from "@/lib/signup/ticket";
import { formatTry } from "@/lib/site/format";
import {
  annualPerDonumKurus,
  loadPublicPackages,
  withVatKurus,
  type PublicPackage,
} from "@/lib/site/packages";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";

// `/` (docs/musteri-yonetimi.md §9): the landing page when signed out; the
// user's section when they have one. A self-service sign-up that stopped
// after the SMS code is finished here; one that never verified its phone is
// sent to /kayit/dogrula. Only self-service accounts (app_metadata.signup =
// "self", set by customer-signup) are asked; any other account without a role
// sees the no-roles card. Completion carries this browser's sign-up ticket:
// a session that cannot prove the registrant (a phone code without the
// ticket) is refused, signed out and told how to finish (SIGNUP_REFUSED_PATH).
export default async function HomePage() {
  const user = await getSessionUser();
  const { signupEnabled, demoUrl } = siteFlags();
  // A demo visitor sees the landing; the header leads back to the demo.
  if (!user || user.demo) {
    const packages = await loadPublicPackages(await createClient());
    return (
      <Landing
        signupEnabled={signupEnabled}
        demoUrl={user?.demo ? null : demoUrl}
        packages={packages}
      />
    );
  }

  const section = defaultSection(user.roles);
  if (section) redirect(`/${section}`);

  let phoneNotVerified = false;
  const supabase = await createClient();
  if (signupEnabled && (await isSelfSignup(supabase))) {
    const result = await completeSignup(supabase, (await readTicket())?.ticket ?? null);
    if (result.ok && result.status === "completed") redirect("/portal");
    if (!result.ok && result.error === "signup_mismatch") redirect(SIGNUP_REFUSED_PATH);
    phoneNotVerified = !result.ok && result.error === "phone_not_verified";
  }

  return (
    <div className={styles.narrow}>
      <div className="card" data-testid={phoneNotVerified ? "verify-phone-card" : "no-roles-card"}>
        {phoneNotVerified ? (
          <>
            <h1>{siteText.home.verifyTitle}</h1>
            <p>{siteText.home.verifyBody}</p>
            <p>
              <Link href="/kayit/dogrula" className="button">
                {siteText.home.verifyLink}
              </Link>
            </p>
          </>
        ) : (
          <p>{t.home.noRoles}</p>
        )}
        <form action={signOut}>
          <button className="button button-secondary" type="submit">
            {t.nav.logout}
          </button>
        </form>
      </div>
    </div>
  );
}

async function isSelfSignup(supabase: Client): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const meta: unknown = data?.claims?.app_metadata;
  return Boolean(
    meta && typeof meta === "object" && (meta as { signup?: unknown }).signup === "self",
  );
}

// Visits of each package by month (docs/fiyatlandirma.md §1, calendar of
// 28 Oct 2026). Prices come from the published list; the months are the
// service calendar, which the list does not carry.
const PACKAGE_MONTHS: Record<string, { month: number; name: string }[]> = {
  temel: [
    { month: 0, name: "Kış" },
    { month: 9, name: "Hasat" },
  ],
  standart: [
    { month: 0, name: "Kış" },
    { month: 3, name: "İlkbahar" },
    { month: 6, name: "Yaz" },
    { month: 9, name: "Hasat" },
  ],
  kapsamli: [
    { month: 0, name: "Kış" },
    { month: 2, name: "Uyanma" },
    { month: 3, name: "İlkbahar" },
    { month: 6, name: "Yaz" },
    { month: 7, name: "Hasat öncesi" },
    { month: 9, name: "Hasat sonrası" },
  ],
};

export function Landing({
  signupEnabled,
  demoUrl,
  packages = [],
}: {
  signupEnabled: boolean;
  demoUrl: string | null;
  packages?: PublicPackage[];
}) {
  const l = siteText.landing;
  const calendar = packages.filter((pkg) => PACKAGE_MONTHS[pkg.code]);
  return (
    <div className={ls.landing}>
      <section className={ls.hero} aria-labelledby="landing-title">
        <div className={ls.heroText}>
          <h1 id="landing-title" className={ls.title}>
            {l.title}
          </h1>
          <p className={ls.lead}>{l.lead}</p>
          <div className={ls.ctaRow}>
            {signupEnabled && (
              <Link href="/kayit" className="button">
                {l.ctaSignup}
              </Link>
            )}
            {/* The demo is the primary action while sign-up is closed. */}
            {demoUrl && (
              <Link
                href={demoUrl}
                className={signupEnabled ? "button button-secondary" : "button"}
                data-testid="landing-demo"
              >
                {l.ctaDemo}
              </Link>
            )}
            {!signupEnabled && !demoUrl && (
              <Link href="/nasil-calisir" className="button">
                {l.ctaHow}
              </Link>
            )}
          </div>
          <p className={ls.ctaNote}>
            {signupEnabled ? l.signupNote : demoUrl ? l.demoNote : null}{" "}
            <Link href="/giris">{l.ctaLogin}</Link>
          </p>
        </div>
        <OrchardPlate />
      </section>

      <section className={ls.band} aria-labelledby="okuma">
        <div className={ls.readGrid}>
          <div>
            <h2 id="okuma" className={ls.h2}>
              {l.readTitle}
            </h2>
            <p className={ls.sectionLead}>{l.readLead}</p>
            <ul className={ls.legend} aria-label={l.classesLabel}>
              {LEGEND.map((c) => {
                const { label, help } = legendText(c);
                return (
                  <li key={c}>
                    <ClassDot value={c} />
                    <span>
                      <strong>{label}</strong> {help}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className={ls.report}>
            <h3>{l.reportTitle}</h3>
            <ul>
              {l.report.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={ls.band} aria-labelledby="kanit">
        <h2 id="kanit" className={ls.h2}>
          {l.evidenceTitle}
        </h2>
        <p className={ls.sectionLead}>{l.evidenceLead}</p>
        <ol className={ls.chain}>
          {l.evidence.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <p className={ls.independence}>{l.independence}</p>
      </section>

      <section className={ls.band} aria-labelledby="adimlar">
        <h2 id="adimlar" className={ls.h2}>
          {l.stepsTitle}
        </h2>
        <ol className={ls.steps}>
          {l.steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <p>
          <Link href="/nasil-calisir">{l.stepsMore}</Link>
        </p>
      </section>

      <section className={ls.band} aria-labelledby="takvim">
        <h2 id="takvim" className={ls.h2}>
          {l.calendarTitle}
        </h2>
        <p className={ls.sectionLead}>{l.calendarLead}</p>
        {calendar.length > 0 && (
          <div className={ls.calendar} role="group" aria-label={l.calendarLabel}>
            <div className={ls.calMonths} aria-hidden>
              <span />
              {l.months.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
            {calendar.map((pkg) => {
              const visits = PACKAGE_MONTHS[pkg.code];
              return (
                <div key={pkg.packageId} className={ls.calRow} data-testid="landing-package">
                  <div className={ls.calName}>
                    <h3>{pkg.name}</h3>
                    <p>{l.visitsPerYear(pkg.periodicVisitsPerYear)}</p>
                    {/* The strip is a picture; this line says the same in words
                        (and is the only one on a phone). */}
                    <p className={ls.calVisits}>
                      {visits.map((v) => `${v.name} (${l.months[v.month]})`).join(", ")}
                    </p>
                    <p className={ls.calPrice}>
                      {l.perDonum(formatTry(withVatKurus(annualPerDonumKurus(pkg), pkg.vatRateBp)))}
                    </p>
                  </div>
                  <div className={ls.calStrip} aria-hidden>
                    {l.months.map((m, i) => {
                      const visit = visits.find((v) => v.month === i);
                      return (
                        <span key={m} className={visit ? ls.calVisit : undefined}>
                          {visit && <span className={ls.calVisitName}>{visit.name}</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className={ls.calNote}>
          {l.calendarNote} <Link href="/paketler">{l.calendarMore}</Link>
        </p>
      </section>

      <section className={ls.band} aria-labelledby="iddia">
        <h2 id="iddia" className={ls.h2}>
          {l.honestTitle}
        </h2>
        <ul className={ls.honest}>
          {l.honest.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {(demoUrl || signupEnabled) && (
        <section className={ls.closing} aria-labelledby="son">
          <div>
            <h2 id="son" className={ls.h2}>
              {demoUrl ? l.closingTitle : l.ctaSignup}
            </h2>
            {demoUrl && <p>{l.closingBody}</p>}
          </div>
          <div className={ls.ctaRow}>
            {demoUrl && (
              <Link href={demoUrl} className="button" data-testid="landing-demo-foot">
                {l.demoFoot}
              </Link>
            )}
            {signupEnabled && (
              <Link href="/kayit" className={demoUrl ? "button button-secondary" : "button"}>
                {l.ctaSignup}
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
