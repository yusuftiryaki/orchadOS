import type { Database } from "@/lib/database.types";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { dayMonthLocative, formatTl, shortDate } from "./format";
import { serviceHref } from "./urls";

// The offer cards of the portal (IP15, docs/MVP.md Module 6, "Öneri
// mantığı"): one row of public.service_offers per owned parcel and active
// service, turned into the card's text and action. Pure; unit tested.

export type ServiceOffer = Database["public"]["Functions"]["service_offers"]["Returns"][number];
export type OfferState = "recommended" | "available" | "pre_request" | "open";

export interface OfferCard {
  state: OfferState;
  parcelId: string;
  parcelName: string;
  serviceTypeId: string;
  // Sentences of the card, in order.
  lines: string[];
  action: { label: string; href: string };
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

// The card of one offer; null for a state this portal does not know.
export function offerCard(offer: ServiceOffer, today: string): OfferCard | null {
  const state = offerState(offer.state);
  if (!state) return null;
  const name = serviceShortName(offer);
  const price = S.card.price(formatTl(offer.estimate_total_kurus), offer.price_is_draft);
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
      return { ...base, lines: [...lines, S.card.offer(name, price)], action: request };
    }
    case "available":
      return { ...base, lines: [S.card.available(name, price)], action: request };
    case "pre_request":
      return {
        ...base,
        lines: [S.card.preRequest(name, dayMonthLocative(offer.season_start))],
        action: { ...request, label: S.card.preRequestAction },
      };
    case "open": {
      const status =
        (S.status as Record<string, string>)[offer.open_request_status] ??
        offer.open_request_status;
      return {
        ...base,
        lines: [S.card.open(name, offer.open_request_number, status)],
        action: { label: S.card.showRequest, href: serviceHref.request(offer.open_request_id) },
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
