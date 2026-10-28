import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CustomerSummary } from "@/lib/portal-billing/data";
import { garden, period } from "@/lib/portal-billing/garden-fixtures";
import { CustomerHome } from "./customer-home";

const EMPTY: CustomerSummary = {
  openQuotes: [],
  awaitingOrders: [],
  draft: null,
  openApplications: [],
  servicePeriod: null,
  gardens: [],
};

const ORDER = {
  id: "o1",
  number: "S-2026-000001",
  status: "awaiting_payment",
  total_kurus: 1200000,
  paid_kurus: 0,
  refunded_kurus: 0,
  currency: "TRY",
} as CustomerSummary["awaitingOrders"][number];

describe("customer home", () => {
  it("asks a customer with nothing yet to register a garden", () => {
    const html = renderToStaticMarkup(<CustomerHome summary={EMPTY} hasParcels={false} />);
    expect(html).toContain('data-testid="home-cta"');
  });

  it("has no call to register for an owner with gardens", () => {
    // Pilot owners and co-owners with an owner profile, and a customer whose
    // order just activated: the garden list follows, nothing else to show.
    expect(renderToStaticMarkup(<CustomerHome summary={EMPTY} hasParcels />)).toBe("");
  });

  it("has no call to register next to an order awaiting payment", () => {
    const html = renderToStaticMarkup(
      <CustomerHome summary={{ ...EMPTY, awaitingOrders: [ORDER] }} hasParcels={false} />,
    );
    expect(html).toContain('data-testid="home-order"');
    expect(html).not.toContain('data-testid="home-cta"');
  });

  // IP14 (docs/bahce-yonetimi.md §11).
  describe("member", () => {
    const MEMBER: CustomerSummary = { ...EMPTY, servicePeriod: period(), gardens: [garden()] };

    it("shows the membership and a card to add a garden", () => {
      const html = renderToStaticMarkup(<CustomerHome summary={MEMBER} hasParcels />);
      expect(html).toContain('data-testid="membership"');
      expect(html).toContain("Üyeliğiniz");
      expect(html).toContain("Standart");
      expect(html).toContain("2 bahçe hizmette");
      expect(html).toContain('data-testid="home-add-garden"');
      expect(html).toContain('href="/portal/basvuru/yeni"');
      expect(html).not.toContain('data-testid="home-cta"');
      expect(html).not.toContain('data-testid="membership-multi"');
      expect(html).not.toContain('data-testid="membership-renewal"');
    });

    it("has no add card while the switch is off", () => {
      const html = renderToStaticMarkup(
        <CustomerHome
          summary={{ ...MEMBER, servicePeriod: period({ garden_changes_enabled: false }) }}
          hasParcels
        />,
      );
      expect(html).toContain('data-testid="membership"');
      expect(html).not.toContain('data-testid="home-add-garden"');
    });

    it("sends a member with a draft to the draft instead", () => {
      const draft = { id: "d1", status: "draft" } as CustomerSummary["draft"];
      const html = renderToStaticMarkup(<CustomerHome summary={{ ...MEMBER, draft }} hasParcels />);
      expect(html).toContain('data-testid="home-draft"');
      expect(html).not.toContain('data-testid="home-add-garden"');
    });

    it("notes more than one period and a ready renewal", () => {
      const html = renderToStaticMarkup(
        <CustomerHome
          summary={{
            ...MEMBER,
            servicePeriod: period({ period_count: 2, renewal_quote_id: "q1" }),
          }}
          hasParcels
        />,
      );
      expect(html).toContain('data-testid="membership-multi"');
      expect(html).toContain("Yenileme teklifiniz hazır");
      expect(html).toContain('href="/portal/teklif/q1"');
    });

    it("says the membership ended once the last garden left", () => {
      const html = renderToStaticMarkup(
        <CustomerHome
          summary={{
            ...EMPTY,
            gardens: [garden({ state: "removed", access_until: "2027-03-10" })],
          }}
          hasParcels
        />,
      );
      expect(html).toContain('data-testid="home-ended"');
      expect(html).not.toContain('data-testid="membership"');
    });
  });

  it("keeps the non-member cards as they were", () => {
    // Gardens of a pilot owner (no order line, no period): nothing new.
    expect(renderToStaticMarkup(<CustomerHome summary={EMPTY} hasParcels />)).toBe("");
    const html = renderToStaticMarkup(<CustomerHome summary={EMPTY} hasParcels={false} />);
    expect(html).not.toContain('data-testid="membership"');
    expect(html).not.toContain('data-testid="home-add-garden"');
  });
});
