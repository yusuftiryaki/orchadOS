import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { OrderPay } from "./order-pay";

// Server actions are not exercised by a static render.
vi.mock("@/app/portal/billing-actions", () => ({ startPaymentAction: async () => {} }));

const INSTRUCTIONS = {
  bankName: "Örnek Bank",
  iban: "TR00 0000 0000 0000 0000 0000 00",
  ibanHolder: "Örnek Tarım A.Ş.",
  reference: "S-2026-000001",
  outstandingKurus: 1200000,
  currency: "TRY",
  paymentDueAt: null,
};

describe("order payment box", () => {
  it("has no card button with the payments flag off", () => {
    const html = renderToStaticMarkup(
      <OrderPay orderId="o" paymentsEnabled={false} instructions={INSTRUCTIONS} />,
    );
    expect(html).not.toContain('data-testid="pay-card"');
    expect(html).not.toContain(`>${P.order.card}</button>`);
    expect(html).not.toContain("<form");
    expect(html).toContain('data-testid="card-off"');
    expect(html).toContain("S-2026-000001");
    expect(html).toContain("12.000,00 ₺");
  });

  it("shows the card button with the flag on", () => {
    const html = renderToStaticMarkup(<OrderPay orderId="o" paymentsEnabled instructions={null} />);
    expect(html).toContain('data-testid="pay-card"');
    expect(html).toContain(P.order.noBank);
  });

  it("links to the live attempt instead of offering a second card payment", () => {
    const html = renderToStaticMarkup(
      <OrderPay orderId="o" paymentsEnabled instructions={INSTRUCTIONS} liveAttemptId="p1" />,
    );
    expect(html).not.toContain('data-testid="pay-card"');
    expect(html).not.toContain("<form");
    expect(html).toContain('data-testid="card-in-progress"');
    expect(html).toContain('href="/portal/odeme/p1"');
    expect(html).toContain('data-testid="bank-transfer"');
  });
});
