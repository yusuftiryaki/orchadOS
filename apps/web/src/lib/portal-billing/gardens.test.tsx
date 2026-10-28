import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MembershipCard } from "@/components/portal-billing/membership-card";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { removalFlags } from "./data";
import { garden, period } from "./garden-fixtures";
import {
  addDays,
  addonInputsOf,
  gardenBadge,
  istanbulToday,
  oneYearEnd,
  openRemoval,
  quoteServiceEnd,
  removable,
} from "./gardens";
import { parseRemovalForm, REMOVAL_TIMINGS } from "./validation";

const reader = (values: Record<string, string>) => (name: string) => values[name] ?? "";

// A formatted date followed by an apostrophe (a Turkish case suffix such as
// "31 Eki 2027'ye") — the portal never writes one (docs/bahce-yonetimi.md §11).
const SUFFIX_AFTER_DATE = /\d{4}\s*['’]/;

describe("removal form", () => {
  const base = { reason: "sold", timing: "notice", confirm: "on" };

  it("maps each of the three timings to the database flags", () => {
    const flags = (timing: string) => {
      const r = parseRemovalForm(reader({ ...base, timing }), { withdrawalOpen: true });
      if (!r.ok) throw new Error(JSON.stringify(r.errors));
      return [r.value.atPeriodEnd, r.value.withdrawal];
    };
    expect(flags("notice")).toEqual([false, false]);
    expect(flags("period_end")).toEqual([true, false]);
    expect(flags("withdrawal")).toEqual([false, true]);
    // The preview calls use the same mapping; never both flags.
    for (const timing of REMOVAL_TIMINGS) {
      const f = removalFlags(timing);
      expect(f.p_at_period_end && f.p_withdrawal).toBe(false);
    }
  });

  it("refuses both flags at once and anything not offered", () => {
    // One radio: a crafted value naming both is not a timing.
    for (const timing of ["period_end,withdrawal", "both", "today", ""]) {
      const r = parseRemovalForm(reader({ ...base, timing }), { withdrawalOpen: true });
      expect(r.ok, timing).toBe(false);
    }
    // The withdrawal option only inside the window.
    const late = parseRemovalForm(reader({ ...base, timing: "withdrawal" }), {
      withdrawalOpen: false,
    });
    expect(late).toEqual({ ok: false, errors: { timing: "invalid" } });
  });

  it("needs a customer reason, the confirmation and a short note", () => {
    expect(parseRemovalForm(reader({ ...base, reason: "" }), { withdrawalOpen: false })).toEqual({
      ok: false,
      errors: { reason: "required" },
    });
    // transfer and duplicate are ops' reasons.
    expect(
      parseRemovalForm(reader({ ...base, reason: "transfer" }), { withdrawalOpen: false }),
    ).toEqual({ ok: false, errors: { reason: "invalid" } });
    expect(parseRemovalForm(reader({ ...base, confirm: "" }), { withdrawalOpen: false })).toEqual({
      ok: false,
      errors: { confirm: "required" },
    });
    expect(
      parseRemovalForm(reader({ ...base, note: "x".repeat(1001) }), { withdrawalOpen: false }),
    ).toEqual({ ok: false, errors: { note: "too_long" } });
    expect(
      parseRemovalForm(reader({ ...base, note: "  satıldı  " }), { withdrawalOpen: false }),
    ).toEqual({
      ok: true,
      value: { reason: "sold", note: "satıldı", atPeriodEnd: false, withdrawal: false },
    });
  });
});

describe("garden states", () => {
  it("writes the badge of each state with the date after a colon", () => {
    expect(gardenBadge(garden())).toBe(P.gardens.inService);
    expect(
      gardenBadge(
        garden({
          state: "leaving",
          removal_effective_on: "2026-12-12",
          removal_status: "requested",
        }),
      ),
    ).toBe(`Çıkış tarihi: ${formatDate("2026-12-12")}`);
    expect(gardenBadge(garden({ state: "removed", access_until: "2027-03-10" }))).toBe(
      `Hizmet dışı · raporlar şu tarihe kadar açık: ${formatDate("2027-03-10")}`,
    );
    expect(gardenBadge(garden({ state: "upcoming", service_start: "2027-11-01" }))).toBe(
      `Sonraki dönemde başlıyor: ${formatDate("2027-11-01")}`,
    );
  });

  it("offers the removal only without an open one", () => {
    expect(removable(garden())).toBe(true);
    expect(removable(garden({ state: "upcoming" }))).toBe(true);
    const leaving = garden({ state: "leaving", removal_id: "r1", removal_status: "scheduled" });
    expect(openRemoval(leaving)).toBe(true);
    expect(removable(leaving)).toBe(false);
    // A cancelled earlier request does not block a new one.
    expect(removable(garden({ removal_id: "r0", removal_status: "cancelled" }))).toBe(true);
    expect(removable(garden({ state: "removed", removal_status: "completed" }))).toBe(false);
  });
});

describe("no case suffix after a date", () => {
  const day = "2027-10-31";
  const date = formatDate(day);

  it("holds for the badges, bands and service texts", () => {
    const texts = [
      gardenBadge(garden({ state: "leaving", removal_effective_on: day })),
      gardenBadge(garden({ state: "removed", access_until: day })),
      gardenBadge(garden({ state: "upcoming", service_start: day })),
      P.gardens.serviceEnd(date),
      P.membership.serviceEnd(date),
      P.membership.nextPeriod(date),
      P.membership.band("Standart", date),
      P.membership.addonPreview(date, date, 2, 4),
      P.quote.addonHeader(date),
      P.removal.period(date, date),
      P.removal.withdrawalUntil(date),
      P.removal.effectiveOn(date),
      P.removal.accessUntil(date),
      P.removal.removedBand(date),
      P.home.quoteBody("T-1", "100 ₺", date),
    ];
    for (const text of texts) {
      expect(text).toContain(date);
      expect(text, text).not.toMatch(SUFFIX_AFTER_DATE);
    }
  });

  it("holds for the rendered membership card", () => {
    const html = renderToStaticMarkup(
      <MembershipCard
        period={period({
          next_period_end: "2028-10-31",
          renewal_quote_id: "q1",
          period_count: 2,
        })}
      />,
    );
    expect(html).toContain(`Hizmet bitişi: ${date}`);
    expect(html).toContain('data-testid="membership-renewal"');
    expect(html).toContain('data-testid="membership-multi"');
    expect(html.replace(/&#x27;/g, "'")).not.toMatch(SUFFIX_AFTER_DATE);
  });
});

describe("quote service end", () => {
  it("is one year less a day, or the membership's end for an add-on", () => {
    expect(oneYearEnd("2026-11-01")).toBe("2027-10-31");
    expect(oneYearEnd("2028-02-29")).toBe("2029-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(quoteServiceEnd({ inputs: {}, proposed_service_start: "2027-03-01" })).toBe(
      "2028-02-29",
    );
    expect(quoteServiceEnd({ inputs: {}, proposed_service_start: null }, "2026-10-28")).toBe(
      "2027-10-27",
    );
    const inputs = {
      formula: "pricing-v2",
      addon: {
        base_order_id: "o1",
        base_order_number: "S-2026-000001",
        period_start: "2026-11-01",
        period_end: "2027-10-31",
        service_start: "2027-03-01",
        remaining_days: 245,
        period_days: 365,
        visits_per_year: 4,
        visits: 3,
        addon_last_day: "2027-10-02",
      },
    };
    expect(quoteServiceEnd({ inputs, proposed_service_start: "2027-03-01" })).toBe("2027-10-31");
    expect(addonInputsOf(inputs)).toEqual({
      baseOrderNumber: "S-2026-000001",
      periodStart: "2026-11-01",
      periodEnd: "2027-10-31",
      serviceStart: "2027-03-01",
      visitsPerYear: 4,
      visits: 3,
      addonLastDay: "2027-10-02",
    });
    expect(addonInputsOf({ addon: { period_end: "x" } })).toBeNull();
    expect(addonInputsOf([])).toBeNull();
  });

  it("knows Istanbul's day", () => {
    // 22:30 UTC is already the next day in Istanbul (UTC+3).
    expect(istanbulToday(new Date("2026-10-28T22:30:00Z"))).toBe("2026-10-29");
  });
});
