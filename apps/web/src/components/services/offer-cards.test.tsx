import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ServiceOffer } from "@/lib/services/offers";
import { ServiceOffers } from "./offer-cards";

const offer = (over: Partial<ServiceOffer>): ServiceOffer =>
  ({
    parcel_id: "p1",
    parcel_name: "Kuzey Bahçe",
    service_type_id: "t1",
    service_code: "weed_mowing",
    service_name: "Yabani ot biçme",
    state: "available",
    in_season: true,
    season_start: "2027-03-01",
    price_is_draft: true,
    estimate_total_kurus: 882_000,
    ...over,
  }) as ServiceOffer;

describe("service offer cards", () => {
  it("renders nothing without offers (switch off, co-owner, unknown area)", () => {
    expect(renderToStaticMarkup(<ServiceOffers offers={[]} today="2027-05-02" />)).toBe("");
  });

  it("names the garden on the home page and links the request form", () => {
    const html = renderToStaticMarkup(
      <ServiceOffers
        offers={[offer({}), offer({ parcel_id: "p2", parcel_name: "Güney", state: "pre_request" })]}
        today="2027-05-02"
        showParcel
      />,
    );
    expect(html).toContain("Bahçe hizmetleri");
    expect(html).toContain("motorlu tırpan");
    expect(html).toContain("Kuzey Bahçe");
    expect(html).toContain('data-state="pre_request"');
    expect(html).toContain('href="/portal/hizmetler/yeni?parsel=p1&amp;hizmet=t1"');
    expect(html).toContain("Ön talep bırak");
    expect(html).toContain('href="/portal/hizmetler"');
  });
});
