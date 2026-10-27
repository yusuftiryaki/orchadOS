import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CustomerSummary } from "@/lib/portal-billing/data";
import { CustomerHome } from "./customer-home";

const EMPTY: CustomerSummary = {
  openQuotes: [],
  awaitingOrders: [],
  draft: null,
  openApplications: [],
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
});
