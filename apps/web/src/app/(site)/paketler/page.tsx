import type { Metadata } from "next";
import styles from "@/components/site/site.module.css";
import { formatDate } from "@/lib/i18n";
import { packageExampleText as E } from "@/lib/i18n/messages/portal-billing";
import { siteText } from "@/lib/i18n/messages/site";
import { formatTry, formatVatRate } from "@/lib/site/format";
import { loadPackageExample, loadPublicPackages } from "@/lib/site/packages";
import { createClient } from "@/lib/supabase/server";

const p = siteText.packages;

export const metadata: Metadata = { title: p.title, description: p.lead };

export default async function PackagesPage() {
  const supabase = await createClient();
  const packages = await loadPublicPackages(supabase);
  const first = packages[0];
  const examples = await Promise.all(
    packages.map((pkg) => loadPackageExample(supabase, pkg.packageId, E.areaM2)),
  );

  return (
    <div className={styles.container}>
      <header className={styles.pageHead}>
        <h1>{p.title}</h1>
        <p className={styles.lead}>{p.lead}</p>
      </header>

      {packages.length === 0 ? (
        <div className={styles.notice} data-testid="packages-empty">
          <h2>{p.empty}</h2>
          <p>{p.emptyBody}</p>
        </div>
      ) : (
        <>
          <div className={`${styles.grid} ${styles.grid3}`}>
            {packages.map((pkg, i) => (
              <article key={pkg.packageId} className={styles.tile} data-testid="package">
                <h2>{pkg.name}</h2>
                {pkg.description && <p>{pkg.description}</p>}
                <p className={styles.price}>{formatTry(pkg.unitPriceKurus)}</p>
                <p className={styles.priceUnit}>{p.perDonum}</p>
                <p>
                  {p.visitsPerYear(pkg.periodicVisitsPerYear)}
                  {pkg.includesInventory && ` · ${p.includesInventory}`}
                </p>
                <dl className={styles.dl}>
                  <dt>{p.minimumFee}</dt>
                  <dd>{formatTry(pkg.minimumFeeKurus)}</dd>
                  <dt>{p.inventoryFee}</dt>
                  <dd>{formatTry(pkg.inventoryFeeKurus)}</dd>
                </dl>
                {examples[i] && (
                  <p data-testid="package-example">
                    <strong>{E.title}:</strong>{" "}
                    {E.body(
                      formatTry(examples[i].subtotalKurus),
                      formatTry(examples[i].vatKurus),
                      formatTry(examples[i].totalKurus),
                    )}
                  </p>
                )}
              </article>
            ))}
          </div>
          <p className={styles.tileFoot}>
            {p.vatNote(formatVatRate(first.vatRateBp))}{" "}
            {p.priceListNote(first.priceListVersion, formatDate(first.validFrom))}
          </p>
        </>
      )}

      <section className={styles.section}>
        <div className={styles.tile}>
          <h2>{p.modelTitle}</h2>
          <ul className={styles.checkList}>
            {p.model.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
