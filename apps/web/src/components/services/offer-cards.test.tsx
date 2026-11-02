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
    price_list_version: 2,
    estimate_total_kurus: 882_000,
    robot_model_id: "r1",
    robot_model_code: "maraba_i",
    robot_model_name: "MARABA-I",
    robot: {
      id: "r1",
      code: "maraba_i",
      name: "MARABA-I",
      shortDescription: "orchadOS tarama kitini taşıyan otonom bahçe robotu",
      capabilities: ["Misinalı biçme kafası"],
      imagePath: "/robots/maraba-dijital-ikiz.jpg",
      drawingPath: "/robots/maraba-i.svg",
    },
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
    expect(html).toContain("Biçmeyi otonom robotumuz MARABA-I yapar.");
    expect(html).not.toContain("tırpan");
    // Each card names the robot that does the job.
    expect(html.match(/data-testid="robot-badge"/g)).toHaveLength(2);
    expect(html).toContain("Otonom robot · MARABA-I");
    expect(html).toContain("Kuzey Bahçe");
    expect(html).toContain('data-state="pre_request"');
    expect(html).toContain('href="/portal/hizmetler/yeni?parsel=p1&amp;hizmet=t1"');
    expect(html).toContain("Ön talep bırak");
    expect(html).toContain('href="/portal/hizmetler"');
    expect(html).toContain("8.820 TL, KDV dahil");
    expect(html).toContain("Fiyat listesi sürüm 2");
  });

  it("unpriced: 'Fiyat teklifle bildirilir' and no amount", () => {
    const html = renderToStaticMarkup(
      <ServiceOffers
        offers={[offer({ estimate_total_kurus: null, price_list_version: null })]}
        today="2027-05-02"
      />,
    );
    expect(html).toContain("Fiyat teklifle bildirilir");
    expect(html).toContain('data-priced="false"');
    expect(html).not.toMatch(/\d TL/);
    expect(html).toContain("Talep et");
  });

  it("no robot model for the service: no badge", () => {
    const html = renderToStaticMarkup(
      <ServiceOffers offers={[offer({ robot: null, robot_model_id: null })]} today="2027-05-02" />,
    );
    expect(html).not.toContain('data-testid="robot-badge"');
  });
});
