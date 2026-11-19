import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PendingRegistration } from "@/lib/lidar/registration";
import { PendingLidarRegistrations } from "./lidar-registrations";

const RUN: PendingRegistration = {
  id: "e7400000-0000-4000-8000-000000000001",
  parcelId: "c0000000-0000-4000-8000-000000000001",
  parcelName: "Kuzey bahçe",
  sessionId: "e7500000-0000-4000-8000-000000000001",
  visitKind: "periodic_scan",
  visitTime: "2026-11-10T07:00:00Z",
  createdAt: "2026-11-18T10:00:00Z",
  reasons: ["trunk_spread_high"],
  hasWorld: true,
};

const decide = async () => ({ ok: false as const, error: "write_failed" as const });

function rows(html: string) {
  return html.split("<tr").slice(2);
}

describe("pending LiDAR registrations", () => {
  it("every row takes the decision; a visit without a 3D world has no link", () => {
    const html = renderToStaticMarkup(
      <PendingLidarRegistrations
        runs={[RUN, { ...RUN, id: "e7400000-0000-4000-8000-000000000002", hasWorld: false }]}
        decide={decide}
      />,
    );
    expect(html).toContain(">Karar<");
    const [withWorld, withoutWorld] = rows(html);
    expect(withWorld).toContain("3D dünyada incele");
    expect(withWorld).toContain(
      "/ofis/parsel/c0000000-0000-4000-8000-000000000001/envanter/duzenle",
    );
    expect(withWorld).toContain('data-testid="registration-accept"');
    expect(withoutWorld).not.toContain("3D dünyada incele");
    expect(withoutWorld).toContain("3D dünya yok");
    expect(withoutWorld).toContain('data-testid="registration-accept"');
    expect(withoutWorld).toContain('data-testid="registration-reject"');
    expect(withoutWorld).toContain("Gövde tutarlılığı düşük");
  });

  it("without a decide action the list only links", () => {
    const html = renderToStaticMarkup(<PendingLidarRegistrations runs={[RUN]} />);
    expect(html).not.toContain(">Karar<");
    expect(html).not.toContain("registration-accept");
    expect(html).toContain("3D dünyada incele");
  });
});
