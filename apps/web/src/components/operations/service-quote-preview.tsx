"use client";

import { useState } from "react";
import { donumToM2 } from "@/lib/back-office/validation";
import { formatKurus } from "@/lib/billing/money";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import { serviceQuote } from "@/lib/services/quote";
import { vatPercent } from "@/lib/services/format";
import styles from "./service-quote-preview.module.css";

const C = opsServicesText.catalog;

// What a parcel of the given size would pay with the price of the published
// price list in force (per dönüm and minimum fee, VAT excluded; the list's
// VAT), by the database's rule (lib/services/quote.ts, private.service_quote).
// Only a preview: the quote is computed again, and frozen with the price list
// version, when an owner asks.
export function ServiceQuotePreview({
  unitPriceKurus,
  minimumFeeKurus,
  vatRateBp,
  defaultDonum = "20",
}: {
  unitPriceKurus: number;
  minimumFeeKurus: number;
  vatRateBp: number;
  defaultDonum?: string;
}) {
  const [donum, setDonum] = useState(defaultDonum);
  const area = donumToM2(donum);
  const quote =
    area != null ? serviceQuote(area, unitPriceKurus, minimumFeeKurus, vatRateBp) : null;

  return (
    <div className={styles.preview} data-testid="service-quote-preview">
      <p className={styles.title}>{C.previewTitle}</p>
      <label className={styles.area}>
        <span>{C.previewArea}</span>
        <input inputMode="decimal" value={donum} onChange={(e) => setDonum(e.target.value)} />
      </label>
      {quote ? (
        <dl className={styles.lines} aria-live="polite">
          <div>
            <dt>{opsServicesText.subtotal}</dt>
            <dd>{formatKurus(quote.subtotalKurus)}</dd>
          </div>
          <div>
            <dt>{opsServicesText.vat(vatPercent(vatRateBp))}</dt>
            <dd>{formatKurus(quote.vatKurus)}</dd>
          </div>
          <div className={styles.total}>
            <dt>{opsServicesText.total}</dt>
            <dd data-testid="service-quote-preview-total">{formatKurus(quote.totalKurus)}</dd>
          </div>
        </dl>
      ) : (
        <p className={styles.invalid}>{C.previewInvalid}</p>
      )}
      <p className={styles.rule}>{C.previewRule}</p>
    </div>
  );
}
