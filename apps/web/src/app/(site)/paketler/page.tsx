import type { Metadata } from "next";
import styles from "@/components/site/pages.module.css";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
              return (
                <article key={pkg.packageId} className={styles.package} data-testid="package">
                  <h2>{pkg.name}</h2>
                  <p className={styles.price}>
                    <span className={styles.priceValue}>
                      {formatTry(withVatKurus(annualPerDonumKurus(pkg), pkg.vatRateBp))}
                    </span>
                    <span className={styles.priceUnit}>{p.perDonum}</span>
                  </p>
                  <p className={styles.visits}>
                    {p.visitsPerYear(pkg.periodicVisitsPerYear)}
                    <span>
                      {p.perVisit(formatTry(withVatKurus(pkg.unitPriceKurus, pkg.vatRateBp)))}
                      {pkg.includesInventory && `. ${p.includesInventory}.`}
                    </span>
                  </p>
                  <p className={styles.description}>{pkg.description}</p>
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
          <p className={styles.note}>
            {p.vatNote(formatVatRate(first.vatRateBp))}{" "}
            {p.priceListNote(first.priceListVersion, formatDate(first.validFrom))}
          </p>
        </>
      )}

      <section className={styles.band} aria-labelledby="fiyat-hesabi">
        <h2 id="fiyat-hesabi" className={styles.h2}>
          {p.modelTitle}
        </h2>
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
