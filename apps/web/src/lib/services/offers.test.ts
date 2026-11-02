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
  weed_height: null,
  observed_at: null,
  measurement_id: null,
  area_m2: 19_600,
  area_source: "boundary",
  species: "antep_fistigi",
  price_list_version: 2,
  price_per_donum_kurus: 37_500,
  minimum_fee_kurus: 250_000,
  vat_rate_bp: 2000,
  estimate_subtotal_kurus: 735_000,
  estimate_vat_kurus: 147_000,
  estimate_total_kurus: 882_000,
  open_request_id: null,
  open_request_status: null,
  open_request_number: null,
  ...over,
});

const NEW = `/portal/hizmetler/yeni?parsel=${PARCEL}&hizmet=${TYPE}`;

// The service has no price in the published price list in force.
const UNPRICED = {
  price_list_version: null,
  price_per_donum_kurus: null,
  minimum_fee_kurus: null,
  vat_rate_bp: null,
  estimate_subtotal_kurus: null,
  estimate_vat_kurus: null,
  estimate_total_kurus: null,
} as const;

describe("service offer cards", () => {
  it("recommended: the observation, the offer, then the price with VAT and its list version", () => {
    const card = offerCard(
      offer({ state: "recommended", weed_height: "tall", observed_at: "2027-04-14T07:00:00Z" }),
      "2027-05-02",
    );
    expect(card).toMatchObject({
      state: "recommended",
      lines: [
        "Bahçenizde ot uzun (son ziyaret: 14 Nisan).",
        "Ot biçme hizmetini bu bahçe için talep edebilirsiniz.",
      ],
      price: { text: "8.820 TL, KDV dahil", note: "Fiyat listesi sürüm 2", priced: true },
      action: { label: "Talep et", href: NEW },
    });
    const medium = offerCard(
      offer({ state: "recommended", weed_height: "medium", observed_at: "2027-04-14T07:00:00Z" }),
      "2027-05-02",
    );
    expect(medium?.lines[0]).toBe("Bahçenizde ot orta boyda (son ziyaret: 14 Nisan).");
  });

  it("no draft or estimate wording on a priced card", () => {
    const card = offerCard(offer(), "2027-05-02")!;
    const text = [...card.lines, card.price?.text, card.price?.note].join(" ");
    expect(text).not.toMatch(/tahmini|taslak/i);
  });

  it("available: the service with its price", () => {
    expect(offerCard(offer(), "2027-05-02")).toMatchObject({
      lines: ["Ot biçme hizmetini bu bahçe için talep edebilirsiniz."],
      price: { text: "8.820 TL, KDV dahil", note: "Fiyat listesi sürüm 2" },
      action: { label: "Talep et", href: NEW },
    });
  });

  it("unpriced: no number, 'Fiyat teklifle bildirilir', and the request still opens", () => {
    for (const state of ["recommended", "available"]) {
      const card = offerCard(
        offer({ ...UNPRICED, state, weed_height: "tall", observed_at: "2027-04-14T07:00:00Z" }),
        "2027-05-02",
      )!;
      expect(card.price).toEqual({ text: "Fiyat teklifle bildirilir", note: null, priced: false });
      expect(card.action).toEqual({ label: "Talep et", href: NEW });
      expect([...card.lines, card.price?.text].join(" ")).not.toMatch(/\d+(\.\d{3})* TL/);
    }
    const pre = offerCard(offer({ ...UNPRICED, state: "pre_request" }), "2026-11-02")!;
    expect(pre.price?.text).toBe("Fiyat teklifle bildirilir");
    expect(pre.action.label).toBe("Ön talep bırak");
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
    // Priced: a pre-request commits to no price, so the card shows none.
    expect(card?.price).toBeNull();
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
      price: null,
      action: { label: "Talebi gör", href: "/portal/hizmetler/a1" },
    });
  });

  it("another service reads with its catalogue name; an unknown state is dropped", () => {
    expect(
      offerCard(offer({ service_code: "tillage", service_name: "Toprak işleme" }), "2027-05-02")
        ?.lines,
    ).toEqual(["Toprak işleme hizmetini bu bahçe için talep edebilirsiniz."]);
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
