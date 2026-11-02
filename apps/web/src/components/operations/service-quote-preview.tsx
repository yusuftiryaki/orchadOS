"use client";

import { useEffect, useRef, useState } from "react";
import { donumToM2, parseAmount, percentToBp } from "@/lib/back-office/validation";
import { formatKurus } from "@/lib/billing/money";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import { serviceQuote } from "@/lib/services/quote";
import styles from "./service-quote-preview.module.css";

const C = opsServicesText.catalog;

interface Prices {
  price: string;
  minimumFee: string;
  vatRate: string;
}

// What a parcel of the given size would pay with the prices typed in the
// surrounding form (fields price, minimum_fee, vat_rate), by the database's
// rule (lib/services/quote.ts, private.service_quote). Only a preview: the
// quote is computed again, and frozen, when an owner asks.
export function ServiceQuotePreview({
  initial,
  defaultDonum = "20",
}: {
  initial: Prices;
  defaultDonum?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [prices, setPrices] = useState(initial);
  const [donum, setDonum] = useState(defaultDonum);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => {
      const value = (name: string) => {
        const el = form.elements.namedItem(name);
        return el instanceof HTMLInputElement ? el.value.trim() : "";
      };
      setPrices({
        price: value("price"),
        minimumFee: value("minimum_fee"),
        vatRate: value("vat_rate"),
      });
    };
    form.addEventListener("input", read);
    return () => form.removeEventListener("input", read);
  }, []);

  const price = parseAmount(prices.price);
  const minimum = prices.minimumFee ? parseAmount(prices.minimumFee, { allowZero: true }) : 0;
  const vat = prices.vatRate ? percentToBp(prices.vatRate) : null;
  const area = donumToM2(donum);
  const quote =
    price != null && minimum != null && vat != null && area != null
      ? serviceQuote(area, price, minimum, vat)
      : null;

  return (
    <div ref={ref} className={styles.preview} data-testid="service-quote-preview">
      <p className={styles.title}>{C.previewTitle}</p>
      <label className={styles.area}>
        <span>{C.previewArea}</span>
        <input
          inputMode="decimal"
          value={donum}
          onChange={(e) => setDonum(e.target.value)}
          // Not a field of the catalogue form.
          form="__none"
        />
      </label>
      {quote ? (
        <dl className={styles.lines} aria-live="polite">
          <div>
            <dt>{opsServicesText.subtotal}</dt>
            <dd>{formatKurus(quote.subtotalKurus)}</dd>
          </div>
          <div>
            <dt>{opsServicesText.vat(prices.vatRate || "0")}</dt>
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
