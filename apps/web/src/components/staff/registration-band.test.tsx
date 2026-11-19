import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LidarRegistration, RegistrationBand as Band } from "@/lib/lidar/registration";
import { RegistrationBand, decisionText } from "./registration-band";

const BASE: LidarRegistration = {
  id: "e7400000-0000-4000-8000-000000000001",
  sessionId: "e7500000-0000-4000-8000-000000000001",
  status: "pending_review",
  autoVerdict: "review",
  ppkStatus: "ppk",
  metrics: { gnssResidualP95M: 0.08, trunkSpreadP95M: 0.21, treesChecked: 14, lioCoverage: 0.93 },
  reasons: ["trunk_spread_high", "clock_unlocked"],
  decidedBy: null,
  decidedByLabel: null,
  decidedAt: null,
  note: null,
  createdAt: "2026-11-18T10:00:00Z",
};

const decide = async () => ({ ok: false as const, error: "write_failed" as const });

function render(
  current: Partial<LidarRegistration>,
  opts: { ops?: boolean; earlier?: Band["earlier"]; cloud?: string | null } = {},
) {
  const reg = { ...BASE, ...current };
  return renderToStaticMarkup(
    <RegistrationBand
      band={{ current: reg, earlier: opts.earlier ?? [] }}
      cloudRegistrationId={opts.cloud === undefined ? reg.id : opts.cloud}
      decide={opts.ops ? decide : undefined}
    />,
  );
}

describe("registration band", () => {
  it("in review: title, quality summary and reasons in Turkish; ops gets the buttons", () => {
    const html = render({}, { ops: true });
    expect(html).toContain('data-status="pending_review"');
    expect(html).toContain("LiDAR kaydı incelemede");
    expect(html).toContain("GNSS sapması (p95)");
    expect(html).toContain("0,08 m");
    expect(html).toContain("Gövde tutarlılığı (p95)");
    expect(html).toContain("0,21 m (14 ağaç)");
    expect(html).toContain("Kapsama");
    expect(html).toContain("%93");
    expect(html).toMatch(/PPK.*Var/);
    expect(html).toContain("Gövde tutarlılığı düşük, Saat GNSS&#x27;e kilitli değildi");
    expect(html).toContain('data-testid="registration-accept"');
    expect(html).toContain(">Kabul et<");
    expect(html).toContain('data-testid="registration-reject"');
    expect(html).toContain(">Reddet<");
    // The note field appears only after "Reddet".
    expect(html).not.toContain("registration-note-input");
    expect(html).not.toContain("registration-other-cloud");
  });

  it("in review without ops: no buttons, ops decides", () => {
    const html = render({});
    expect(html).toContain("LiDAR kaydı incelemede");
    expect(html).toContain("Kararı operasyon verir");
    expect(html).not.toContain("registration-accept");
    expect(html).not.toContain("registration-reject");
  });

  it("rejected: title and the note, no buttons even for ops", () => {
    const html = render(
      {
        status: "rejected",
        decidedBy: "u1",
        decidedByLabel: "ops@example.com",
        decidedAt: "2026-11-18T12:00:00Z",
        note: "Çift gövde görünüyor",
      },
      { ops: true },
    );
    expect(html).toContain('data-status="rejected"');
    expect(html).toContain("LiDAR kaydı reddedildi");
    expect(html).toContain("Çift gövde görünüyor");
    expect(html).toContain("Karar: ops@example.com");
    expect(html).not.toContain("registration-accept");
  });

  it("accepted: who decided, or the automatic acceptance", () => {
    const byOps = render({
      status: "accepted",
      decidedBy: "u1",
      decidedByLabel: null,
      decidedAt: "2026-11-18T12:00:00Z",
    });
    expect(byOps).toContain("LiDAR kaydı kabul edildi");
    expect(byOps).toContain("Karar: operasyon");
    const auto = render({ status: "accepted", autoVerdict: "accepted_auto", reasons: [] });
    expect(auto).toContain("Otomatik kabul");
    expect(auto).toContain("Neden yok");
    expect(decisionText({ ...BASE, status: "rejected", autoVerdict: "rejected_auto" })).toMatch(
      /^Otomatik ret/,
    );
  });

  it("summarises earlier runs and says when the cloud on screen is another run's", () => {
    const html = render(
      {},
      {
        earlier: [
          { status: "rejected", count: 2 },
          { status: "superseded", count: 1 },
        ],
        cloud: null,
      },
    );
    expect(html).toContain("Önceki kayıtlar: 2 reddedildi, 1 yerine yenisi geldi");
    expect(html).toContain('data-testid="registration-other-cloud"');
  });

  it("shows missing values as not measured", () => {
    const html = render({
      metrics: {
        gnssResidualP95M: null,
        trunkSpreadP95M: null,
        treesChecked: 0,
        lioCoverage: null,
      },
      ppkStatus: "ppk_failed",
    });
    expect(html.match(/Ölçülmedi/g)).toHaveLength(3);
    expect(html).toContain("Başarısız");
  });
});
