import type { Database } from "@/lib/database.types";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { dayMonthLocative, formatTl, shortDate } from "./format";
import { serviceHref } from "./urls";

// The offer cards of the portal (IP15, docs/MVP.md Module 6, "Öneri
// mantığı"): one row of public.service_offers per owned parcel and active
// service, turned into the card's text and action. Pure; unit tested.

type OfferRow = Database["public"]["Functions"]["service_offers"]["Returns"][number];

// Columns the database leaves null: the price and the estimate when the
// published price list has no price for the service (or no list is in force),
// the observation when there is none, the open request when there is none.
// The generated types do not say so for set-returning functions.
type Nullable =
  | "price_list_version"
  | "price_per_donum_kurus"
  | "minimum_fee_kurus"
  | "vat_rate_bp"
  | "estimate_subtotal_kurus"
  | "estimate_vat_kurus"
  | "estimate_total_kurus"
  | "weed_height"
  | "observed_at"
  | "measurement_id"
  | "open_request_id"
  | "open_request_status"
  | "open_request_number";
export type ServiceOffer = Omit<OfferRow, Nullable> & {
  [K in Nullable]: OfferRow[K] | null;
};
export type OfferState = "recommended" | "available" | "pre_request" | "open";

export interface OfferPrice {
  // "8.820 TL, KDV dahil", or "Fiyat teklifle bildirilir" when unpriced.
  text: string;
  // Small print under a priced amount: the price list version.
  note: string | null;
  priced: boolean;
}

export interface OfferCard {
  state: OfferState;
  parcelId: string;
  parcelName: string;
  serviceTypeId: string;
  // Sentences of the card, in order.
  lines: string[];
  // Recommended and available: the estimate, or "Fiyat teklifle bildirilir".
  // Pre-request: only "Fiyat teklifle bildirilir" when unpriced (a pre-request
  // commits to no price either way). Open: none.
  price: OfferPrice | null;
  action: { label: string; href: string };
}

// The price line of an offer: the estimate with its price list version, or
// no number at all when the service is unpriced.
export function offerPrice(offer: {
  estimate_total_kurus: number | null;
  price_list_version: number | null;
}): OfferPrice {
  if (offer.estimate_total_kurus === null) {
    return { text: S.card.noPrice, note: null, priced: false };
  }
  return {
    text: S.card.price(formatTl(offer.estimate_total_kurus)),
    note:
      offer.price_list_version !== null ? S.card.priceListVersion(offer.price_list_version) : null,
    priced: true,
  };
}

// "Ot biçme" for weed mowing; the catalogue name for any other service.
export function serviceShortName(offer: { service_code: string; service_name: string }): string {
  return S.shortName[offer.service_code] ?? offer.service_name;
}

export function offerState(value: string): OfferState | null {
  return value === "recommended" ||
    value === "available" ||
    value === "pre_request" ||
    value === "open"
    ? value
    : null;
}

export interface OfferEstimate {
  version: number;
  perDonum: number;
  minimumFee: number;
  vatRateBp: number;
  subtotal: number;
  vat: number;
  total: number;
}

// The estimate an offer shows and a request would freeze, or null when the
// service is unpriced (the database sets all of these or none).
export function offerEstimate(offer: ServiceOffer): OfferEstimate | null {
  const {
    price_list_version: version,
    price_per_donum_kurus: perDonum,
    minimum_fee_kurus: minimumFee,
    vat_rate_bp: vatRateBp,
    estimate_subtotal_kurus: subtotal,
    estimate_vat_kurus: vat,
    estimate_total_kurus: total,
  } = offer;
  if (
    version === null ||
    perDonum === null ||
    minimumFee === null ||
    vatRateBp === null ||
    subtotal === null ||
    vat === null ||
    total === null
  ) {
    return null;
  }
  return { version, perDonum, minimumFee, vatRateBp, subtotal, vat, total };
}

// The card of one offer; null for a state this portal does not know.
export function offerCard(offer: ServiceOffer, today: string): OfferCard | null {
  const state = offerState(offer.state);
  if (!state) return null;
  const name = serviceShortName(offer);
  const price = offerPrice(offer);
  const base = {
    state,
    parcelId: offer.parcel_id,
    parcelName: offer.parcel_name,
    serviceTypeId: offer.service_type_id,
  };
  const request = {
    label: S.card.request,
    href: serviceHref.newRequest(offer.parcel_id, offer.service_type_id),
  };
  switch (state) {
    case "recommended": {
      // The database recommends only from medium or tall; a missing
      // observation would make the sentence wrong, so it is left out.
      const weed = offer.weed_height ? S.weedPhrase[offer.weed_height] : undefined;
      const lines =
        weed && offer.observed_at
          ? [S.card.recommended(weed, shortDate(offer.observed_at, today))]
          : [];
      return { ...base, lines: [...lines, S.card.offer(name)], price, action: request };
    }
    case "available":
      return { ...base, lines: [S.card.offer(name)], price, action: request };
    case "pre_request":
      return {
        ...base,
        lines: [S.card.preRequest(name, dayMonthLocative(offer.season_start))],
        price: price.priced ? null : price,
        action: { ...request, label: S.card.preRequestAction },
      };
    case "open": {
      const status =
        (S.status as Record<string, string>)[offer.open_request_status ?? ""] ??
        offer.open_request_status ??
        "";
      return {
        ...base,
        lines: [S.card.open(name, offer.open_request_number ?? "", status)],
        price: null,
        action: {
          label: S.card.showRequest,
          href: offer.open_request_id
            ? serviceHref.request(offer.open_request_id)
            : serviceHref.list(),
        },
      };
    }
  }
}

// Recommendations first, then open requests, offers and pre-requests; the
// database's order (parcel name, catalogue order) within a state.
const ORDER: Record<OfferState, number> = { recommended: 0, open: 1, available: 2, pre_request: 3 };

export function offerCards(offers: ServiceOffer[], today: string): OfferCard[] {
  return offers
    .map((o) => offerCard(o, today))
    .filter((c): c is OfferCard => c !== null)
    .map((card, i) => ({ card, i }))
    .sort((a, b) => ORDER[a.card.state] - ORDER[b.card.state] || a.i - b.i)
    .map(({ card }) => card);
}
