import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { garden } from "@/lib/portal-billing/garden-fixtures";
import { ServiceCard, type ServiceCardData } from "./service-card";

vi.mock("@/app/portal/parsel/[parcelId]/actions", () => ({
  cancelGardenRemovalAction: async () => {},
  requestGardenRemovalAction: async () => {},
}));

const leaving = (initiatedBy: string): ServiceCardData => ({
  garden: garden({
    state: "leaving",
    removal_id: "r1",
    removal_number: "C-2026-000001",
    removal_status: "scheduled",
    removal_effective_on: "2026-12-12",
    removal_initiated_by: initiatedBy,
  }),
  changesEnabled: true,
  options: [],
  previewError: null,
  pendingOrderId: null,
  today: "2026-11-20",
});

describe("service card", () => {
  it("offers the undo on the customer's own request", () => {
    const html = renderToStaticMarkup(<ServiceCard data={leaving("customer")} params={{}} />);
    expect(html).toContain("Talebi geri al");
    expect(html).not.toContain('data-testid="removal-by-ops"');
  });

  it("shows a removal ops opened without the undo (§5.1)", () => {
    const html = renderToStaticMarkup(<ServiceCard data={leaving("ops")} params={{}} />);
    expect(html).not.toContain("Talebi geri al");
    expect(html).not.toContain('name="removal_id"');
    expect(html).toContain('data-testid="removal-by-ops"');
    expect(html).toContain("ekibimiz başlattı");
  });
});
