import type { Metadata } from "next";
import styles from "@/components/site/pages.module.css";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IconCalendar, IconCheck } from "@/components/ui/icons";
import { siteFlags } from "@/lib/flags";
import { formatDate } from "@/lib/i18n";
import { packageExampleText as E } from "@/lib/i18n/messages/portal-billing";
import { siteText } from "@/lib/i18n/messages/site";
import { formatTry, formatVatRate } from "@/lib/site/format";
import {
  annualPerDonumKurus,
  loadPackageExample,
  loadPublicPackages,
  withVatKurus,
} from "@/lib/site/packages";
import { createClient } from "@/lib/supabase/server";

const p = siteText.packages;

export const metadata: Metadata = { title: p.title, description: p.lead };

export default async function PackagesPage() {
  const supabase = await createClient();
  const packages = await loadPublicPackages(supabase);
  const first = packages[0];
  const { signupEnabled, demoUrl } = siteFlags();
  // Consumer prices are shown with VAT; the 20-dönüm example comes from the
  // database's formula for a later year and for the first year.
  const examples = await Promise.all(
    packages.map(async (pkg) => {
      const [yearly, firstYear] = await Promise.all([
        loadPackageExample(supabase, pkg.packageId, E.areaM2, false),
        loadPackageExample(supabase, pkg.packageId, E.areaM2, true),
      ]);
      return yearly && firstYear ? { yearly, firstYear } : null;
    }),
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{p.title}</h1>
        <p className={styles.lead}>{p.lead}</p>
      </header>

      {packages.length === 0 ? (
        <EmptyState title={p.empty} testId="packages-empty">
          <p>{p.emptyBody}</p>
        </EmptyState>
      ) : (
        <>
          <div className={styles.packages}>
            {packages.map((pkg, i) => {
              const example = examples[i];
              const featured = pkg.code === p.recommendedCode;
              return (
                <article
                  key={pkg.packageId}
                  className={featured ? `${styles.package} ${styles.featured}` : styles.package}
                  data-testid="package"
                >
                  <div className={styles.packageHead}>
                    <h2>{pkg.name}</h2>
                    {featured && <Badge tone="success">{p.recommended}</Badge>}
                  </div>
                  <p className={styles.description}>{pkg.description}</p>
                  <p className={styles.price}>
                    <span className={styles.priceValue}>
                      {formatTry(withVatKurus(annualPerDonumKurus(pkg), pkg.vatRateBp))}
                    </span>
                    <span className={styles.priceUnit}>{p.perDonum}</span>
                  </p>
                  <div>
                    {signupEnabled ? (
                      <ButtonLink href="/kayit" variant={featured ? "primary" : "secondary"} block>
                        {p.choose(pkg.name)}
                      </ButtonLink>
                    ) : (
                      <ButtonLink href="/iletisim" variant="secondary" block>
                        {p.contactCta}
                      </ButtonLink>
                    )}
                  </div>
                  <ul className={styles.features}>
                    <li>
                      <IconCalendar size={18} />
                      <span>
                        <strong>{p.visitsPerYear(pkg.periodicVisitsPerYear)}</strong>
                        <span>
                          {p.perVisit(formatTry(withVatKurus(pkg.unitPriceKurus, pkg.vatRateBp)))}
                        </span>
                      </span>
                    </li>
                    {pkg.includesInventory && (
                      <li>
                        <IconCheck size={18} />
                        <span>{p.includesInventory}</span>
                      </li>
                    )}
                  </ul>
                  <dl className={styles.facts}>
                    <div>
                      <dt>{p.minimumFee}</dt>
                      <dd>{formatTry(withVatKurus(pkg.minimumFeeKurus, pkg.vatRateBp))}</dd>
                    </div>
                    <div>
                      <dt>{p.inventoryFee}</dt>
                      <dd>{formatTry(withVatKurus(pkg.inventoryFeeKurus, pkg.vatRateBp))}</dd>
                    </div>
                  </dl>
                  {example ? (
                    <p className={styles.example} data-testid="package-example">
                      <strong>{E.title}</strong>
                      {E.body(
                        formatTry(example.yearly.totalKurus),
                        formatTry(example.firstYear.totalKurus),
                      )}
                    </p>
                  ) : (
                    <span />
                  )}
                </article>
              );
            })}
          </div>
          <p className={`${styles.note} ${styles.packagesNote}`}>
            {p.vatNote(formatVatRate(first.vatRateBp))}{" "}
            {p.priceListNote(first.priceListVersion, formatDate(first.validFrom))}
          </p>
        </>
      )}

      <section className={`${styles.band} ${styles.modelGrid}`} aria-labelledby="fiyat-hesabi">
        <div>
          <h2 id="fiyat-hesabi" className={styles.h2}>
            {p.modelTitle}
          </h2>
          <p className={styles.sectionLead}>{p.modelLead}</p>
        </div>
        <ul className={styles.model}>
          {p.model.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {(signupEnabled || demoUrl) && (
        <section className={styles.closing} aria-labelledby="paket-secimi">
          <div>
            <h2 id="paket-secimi">{p.ctaTitle}</h2>
            <p>{p.ctaBody}</p>
          </div>
          <div className={styles.ctaRow}>
            {signupEnabled && <ButtonLink href="/kayit">{p.ctaSignup}</ButtonLink>}
            {demoUrl && (
              <ButtonLink href={demoUrl} variant={signupEnabled ? "secondary" : "primary"}>
                {p.ctaDemo}
              </ButtonLink>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
