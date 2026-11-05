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
        <div className={ls.container}>
          <h1 id="landing-title" className={ls.title}>
            {l.title}
          </h1>
          <div className={ls.heroGrid}>
            <div className={ls.heroText}>
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
          </div>
        </div>
      </section>

      <section className={ls.section} aria-labelledby="okuma">
        <div className={ls.container}>
          <SectionHead id="okuma" title={l.readTitle} lead={l.readLead} />
          <div className={ls.readGrid}>
            <ul className={ls.legend} aria-label={l.classesLabel}>
              {LEGEND.map((c) => {
                const { label, help } = legendText(c);
                return (
                  <li key={c}>
                    <ClassDot value={c} />
                    <span>
                      <strong>{label}</strong>
                      <span>{help}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className={ls.report}>
              <h3>{l.reportTitle}</h3>
              <ul>
                {l.report.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={ls.section} aria-labelledby="kanit">
        <div className={ls.container}>
          <SectionHead id="kanit" title={l.evidenceTitle} lead={l.evidenceLead} />
          {/* A drill-down, drawn as a row of trees on one line: the first is
              the plate's picked tree, where a finding starts. */}
          <ol className={ls.chain}>
            {l.evidence.map((step) => (
              <li key={step.title}>
                <span className={ls.chainDot} aria-hidden />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <p className={ls.independence}>{l.independence}</p>
        </div>
      </section>

      <section className={ls.section} aria-labelledby="adimlar">
        <div className={ls.container}>
          <SectionHead id="adimlar" title={l.stepsTitle} />
          <ol className={ls.steps}>
            {l.steps.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <p className={ls.more}>
            <Link href="/nasil-calisir" className={ls.textLink}>
              {l.stepsMore}
            </Link>
          </p>
        </div>
      </section>

      <section className={ls.section} aria-labelledby="takvim">
        <div className={ls.container}>
          <SectionHead id="takvim" title={l.calendarTitle} lead={l.calendarLead} />
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
                      <p className={ls.calPrice}>
                        <strong>
                          {formatTry(withVatKurus(annualPerDonumKurus(pkg), pkg.vatRateBp))}
                        </strong>{" "}
                        {siteText.packages.perDonum}
                      </p>
                    </div>
                    <div className={ls.calStrip} aria-hidden>
                      {l.months.map((m, i) => {
                        const visit = visits.find((v) => v.month === i);
                        return (
                          <span key={m} className={visit ? ls.calVisit : undefined}>
                            <span className={ls.calDot} />
                            {visit && <span className={ls.calVisitName}>{visit.name}</span>}
                          </span>
                        );
                      })}
                    </div>
                    {/* The strip is a picture; this line says the same in words
                        (and names the months on a phone). */}
                    <ul className={ls.calVisits}>
                      {visits.map((v) => (
                        <li key={v.month}>{`${v.name} (${l.months[v.month]})`}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <div className={ls.calFoot}>
            <p className={ls.calNote}>{l.calendarNote}</p>
            <Link href="/paketler" className={ls.textLink}>
              {l.calendarMore}
            </Link>
          </div>
        </div>
      </section>

      <section className={ls.section} aria-labelledby="iddia">
        <div className={`${ls.container} ${ls.sideGrid}`}>
          <SectionHead id="iddia" title={l.honestTitle} />
          <ul className={ls.honest}>
            {l.honest.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {(demoUrl || signupEnabled) && (
        <section className={ls.section} aria-labelledby="son">
          <div className={`${ls.container} ${ls.closing}`}>
            <div>
              <h2 id="son" className={ls.h2}>
                {demoUrl ? l.closingTitle : siteText.how.closingTitle}
              </h2>
              <p className={ls.sectionLead}>{demoUrl ? l.closingBody : siteText.how.closingBody}</p>
            </div>
            <div className={ls.closingActions}>
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
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHead({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className={ls.sectionHead}>
      <h2 id={id} className={ls.h2}>
        {title}
      </h2>
      {lead && <p className={ls.sectionLead}>{lead}</p>}
    </div>
  );
}
