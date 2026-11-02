import { describe, expect, it } from "vitest";
import { offerCard, offerCards, type ServiceOffer } from "./offers";

const PARCEL = "c0000000-0000-4000-8000-000000000001";
const TYPE = "91500000-0000-4000-8000-000000000001";

const offer = (over: Partial<ServiceOffer> = {}): ServiceOffer => ({
  parcel_id: PARCEL,
  parcel_name: "Kuzey Bahçe",
  service_type_id: TYPE,
  service_code: "weed_mowing",
  service_name: "Yabani ot biçme",
  service_description: "",
  state: "available",
  in_season: true,
  season_start: "2027-03-01",
  season_end: "2027-06-30",
  weed_height: null as unknown as string,
  observed_at: null as unknown as string,
  measurement_id: null as unknown as string,
  area_m2: 19_600,
  area_source: "boundary",
  price_per_donum_kurus: 37_500,
  minimum_fee_kurus: 250_000,
  vat_rate_bp: 2000,
  price_is_draft: true,
  estimate_subtotal_kurus: 735_000,
  estimate_vat_kurus: 147_000,
  estimate_total_kurus: 882_000,
  open_request_id: null as unknown as string,
  open_request_status: null as unknown as string,
  open_request_number: null as unknown as string,
  ...over,
});

const NEW = `/portal/hizmetler/yeni?parsel=${PARCEL}&hizmet=${TYPE}`;

describe("service offer cards", () => {
  it("recommended: the observation, then the price with VAT and the estimate mark", () => {
    const card = offerCard(
      offer({ state: "recommended", weed_height: "tall", observed_at: "2027-04-14T07:00:00Z" }),
      "2027-05-02",
    );
    expect(card).toMatchObject({
      state: "recommended",
      lines: [
        "Bahçenizde ot uzun (son ziyaret: 14 Nisan).",
        "Ot biçme: 8.820 TL, KDV dahil, tahmini.",
      ],
      action: { label: "Talep et", href: NEW },
    });
    const medium = offerCard(
      offer({ state: "recommended", weed_height: "medium", observed_at: "2027-04-14T07:00:00Z" }),
      "2027-05-02",
    );
    expect(medium?.lines[0]).toBe("Bahçenizde ot orta boyda (son ziyaret: 14 Nisan).");
  });

  it("a final price is not an estimate", () => {
    const card = offerCard(offer({ price_is_draft: false }), "2027-05-02");
    expect(card?.lines).toEqual(["Ot biçme hizmeti: 8.820 TL, KDV dahil."]);
  });

  it("available: the service with its price", () => {
    expect(offerCard(offer(), "2027-05-02")).toMatchObject({
      lines: ["Ot biçme hizmeti: 8.820 TL, KDV dahil, tahmini."],
      action: { label: "Talep et", href: NEW },
    });
  });

  it("pre_request: when the season opens, non-binding, no price", () => {
    const card = offerCard(
      offer({ state: "pre_request", in_season: false, season_start: "2027-03-01" }),
      "2026-11-02",
    );
    expect(card).toMatchObject({
      lines: [
        "Ot biçme sezonu 1 Mart'ta açılıyor. Gelecek sezon için ön talep bırakın; bağlayıcı değildir.",
      ],
      action: { label: "Ön talep bırak", href: NEW },
    });
    expect(card?.lines.join(" ")).not.toContain("TL");
  });

  it("open: the request's state and a link to it", () => {
    const card = offerCard(
      offer({
        state: "open",
        open_request_id: "a1",
        open_request_number: "H-2027-000004",
        open_request_status: "scheduled",
      }),
      "2027-05-02",
    );
    expect(card).toMatchObject({
      lines: ["Ot biçme talebiniz H-2027-000004: Planlandı."],
      action: { label: "Talebi gör", href: "/portal/hizmetler/a1" },
    });
  });

  it("another service reads with its catalogue name; an unknown state is dropped", () => {
    expect(
      offerCard(offer({ service_code: "tillage", service_name: "Toprak işleme" }), "2027-05-02")
        ?.lines,
    ).toEqual(["Toprak işleme hizmeti: 8.820 TL, KDV dahil, tahmini."]);
    expect(offerCard(offer({ state: "whatever" }), "2027-05-02")).toBeNull();
  });

  it("never promises a robot", () => {
    const states = ["recommended", "available", "pre_request", "open"];
    for (const state of states) {
      const text = offerCard(
        offer({ state, weed_height: "tall", observed_at: "2027-04-14T07:00:00Z" }),
        "2027-05-02",
      )!.lines.join(" ");
      expect(text.toLocaleLowerCase("tr")).not.toContain("robot");
    }
  });

  it("orders recommendations first, then open requests, offers, pre-requests", () => {
    const cards = offerCards(
      [
        offer({ parcel_id: "p1", state: "pre_request" }),
        offer({ parcel_id: "p2", state: "available" }),
        offer({ parcel_id: "p3", state: "open", open_request_id: "x" }),
        offer({ parcel_id: "p4", state: "recommended" }),
        offer({ parcel_id: "p5", state: "available" }),
      ],
      "2027-05-02",
    );
    expect(cards.map((c) => c.parcelId)).toEqual(["p4", "p3", "p2", "p5", "p1"]);
    expect(offerCards([], "2027-05-02")).toEqual([]);
  });
});
