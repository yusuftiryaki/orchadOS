import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import type { RemovalPreview } from "@/lib/portal-billing/data";
import { garden } from "@/lib/portal-billing/garden-fixtures";
import { ServiceCard, type ServiceCardData } from "./service-card";

// The service card's withdrawal (docs/hukuk/kararlar.md H10, H11 (c), T03).
vi.mock("@/app/portal/parsel/[parcelId]/actions", () => ({
  requestGardenRemovalAction: async () => {},
  cancelGardenRemovalAction: async () => {},
}));

const option = (timing: RemovalPreview["timing"]): RemovalPreview => ({
  timing,
  effectiveOn:
    timing === "withdrawal" ? "2026-11-05" : timing === "notice" ? "2026-12-05" : "2027-11-01",
  accessUntil: "2027-03-05",
  refundEstimateKurus: 1_200_000,
  withdrawalUntil: "2026-11-15",
  visitsEntitled: 4,
  visitsUsed: 0,
});

const card = (over: Partial<ServiceCardData>) =>
  renderToStaticMarkup(
    <ServiceCard
      params={{}}
      data={{
        garden: garden(),
        changesEnabled: true,
        options: [],
        previewError: null,
        pendingOrderId: null,
        today: "2026-11-05",
        ...over,
      }}
    />,
  );

describe("service card withdrawal (T03)", () => {
  it("warns that another timing inside the period is no withdrawal", () => {
    const html = card({ options: [option("notice"), option("period_end"), option("withdrawal")] });
    expect(html.split(P.removal.notWithdrawal)).toHaveLength(3);
    expect(html).toContain('data-timing="withdrawal"');
  });

  it("no warning after the withdrawal period", () => {
    const html = card({ today: "2026-11-20", options: [option("notice"), option("period_end")] });
    expect(html).not.toContain(P.removal.notWithdrawal);
  });

  it("offers only the withdrawal while garden changes are off (H10)", () => {
    const html = card({ changesEnabled: false, options: [option("withdrawal")] });
    expect(html).toContain(P.removal.withdrawalFormTitle);
    expect(html).toContain('data-timing="withdrawal"');
    expect(html).not.toContain('data-timing="notice"');
    expect(html).not.toContain('data-testid="removal-closed"');
  });

  it("stays closed with the switch off after the period", () => {
    const html = card({ changesEnabled: false, today: "2026-11-20" });
    expect(html).toContain('data-testid="removal-closed"');
  });

  it("offers the withdrawal over an open removal of another kind", () => {
    const html = card({
      garden: garden({
        removal_id: "r1",
        removal_number: "C-2026-000001",
        removal_status: "requested",
        removal_initiated_by: "customer",
        removal_effective_on: "2026-12-05",
      }),
      options: [option("withdrawal")],
    });
    expect(html).toContain('data-testid="removal-open"');
    expect(html).toContain('data-timing="withdrawal"');
  });

  it("confirms a recorded withdrawal", () => {
    const html = card({
      withdrawal: {
        number: "C-2026-000002",
        status: "requested",
        channel: "portal",
        receivedOn: "2026-11-05",
      },
    });
    expect(html).toContain('data-testid="withdrawal-received"');
    expect(html).toContain("C-2026-000002");
  });
});
