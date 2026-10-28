import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/database.types";
import { tr } from "@/lib/i18n/tr";
import type { Position } from "@/lib/map/geo";
import { donumToM2, m2ToDonum, parseRing, ringAreaM2, validateRing } from "./geometry";
import { reasonOf } from "./mutations";
import { NOTICES, opsHref, readResult } from "./urls";
import {
  AUTHORIZATION_BASES,
  CONTACT_PREFERENCES,
  FIELD_ERRORS,
  normalizePhone,
  parseDecimal,
  parseDetailForm,
  parseOwnerForm,
  parseParcelForm,
  parseVisitForm,
  type Read,
} from "./validation";
import {
  addDays,
  capturedAt,
  countByStatus,
  isIsoDate,
  overdueVisits,
  todayIn,
  upcomingVisits,
  VISIT_KINDS,
  visitSeason,
  type VisitRow,
} from "./visits";

const reader =
  (fields: Record<string, string>): Read =>
  (name) =>
    fields[name] ?? "";

// About 90 m x 110 m around 37.40 E 37.02 N.
const SQUARE: Position[] = [
  [37.4, 37.02],
  [37.401, 37.02],
  [37.401, 37.021],
  [37.4, 37.021],
];

describe("phone numbers", () => {
  it.each([
    ["0532 123 45 67", "+905321234567"],
    ["532 123 4567", "+905321234567"],
    ["+90 (532) 123-45-67", "+905321234567"],
    ["0090 532 123 45 67", "+905321234567"],
    ["+49 30 1234567", "+49301234567"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("rejects what is not a phone number and keeps empty as empty", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("  ")).toBeNull();
    expect(normalizePhone("0532 123")).toBe("invalid");
    expect(normalizePhone("call me")).toBe("invalid");
    expect(normalizePhone("+0 532 123 45 67")).toBe("invalid");
  });
});

describe("decimals", () => {
  it("reads Turkish commas and dots", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal(" 37.0215 ")).toBe(37.0215);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("1.234,5")).toBe("invalid");
  });
});

describe("owner form", () => {
  const valid = {
    full_name: " Ayşe Yılmaz ",
    phone: "0532 123 45 67",
    email: "Ayse@Example.com",
    contact_preference: "whatsapp",
    kvkk_consent: "on",
    kvkk_consent_at: "2026-10-21",
    kvkk_text_version: "kvkk-v0",
  };

  it("cleans a valid form", () => {
    expect(parseOwnerForm(reader(valid), { requireConsent: true })).toEqual({
      ok: true,
      value: {
        fullName: "Ayşe Yılmaz",
        phone: "+905321234567",
        email: "ayse@example.com",
        contactPreference: "whatsapp",
        kvkkConsent: true,
        kvkkConsentAt: "2026-10-21T12:00:00Z",
        kvkkTextVersion: "kvkk-v0",
      },
    });
  });

  it("needs name, phone, contact preference and, for a new owner, the consent", () => {
    const result = parseOwnerForm(reader({}), { requireConsent: true });
    expect(result).toEqual({
      ok: false,
      errors: {
        full_name: "required",
        phone: "required",
        contact_preference: "required",
        kvkk_consent: "required",
      },
    });
  });

  it("consent needs its day and text version; errors carry no values", () => {
    const result = parseOwnerForm(
      reader({
        ...valid,
        phone: "12",
        email: "not-an-email",
        kvkk_consent_at: "",
        kvkk_text_version: "",
      }),
      { requireConsent: true },
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        phone: "invalid",
        email: "invalid",
        kvkk_consent_at: "required",
        kvkk_text_version: "required",
      },
    });
  });

  it("a correction may withdraw the consent", () => {
    const result = parseOwnerForm(reader({ ...valid, kvkk_consent: "" }), {
      requireConsent: false,
    });
    expect(result.ok && result.value).toMatchObject({
      kvkkConsent: false,
      kvkkConsentAt: null,
      kvkkTextVersion: null,
    });
  });

  it("rejects an unknown contact preference and overlong names", () => {
    const result = parseOwnerForm(
      reader({ ...valid, contact_preference: "pigeon", full_name: "x".repeat(201) }),
      { requireConsent: true },
    );
    expect(result).toEqual({
      ok: false,
      errors: { contact_preference: "invalid", full_name: "too_long" },
    });
  });
});

describe("parcel form", () => {
  it("cleans a valid form; dönüm becomes m²", () => {
    const result = parseParcelForm(
      reader({
        name: "Tepe Bahçesi",
        province: "Gaziantep",
        district: "Nizip",
        village: "",
        area_donum: "12,5",
        irrigation: "rainfed",
        tree_count: "240",
        lat: "37,0215",
        lon: "37.795",
        boundary: JSON.stringify(SQUARE),
        owner_profile_id: "a0000000-0000-4000-8000-000000000001",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Tepe Bahçesi",
        province: "Gaziantep",
        district: "Nizip",
        village: null,
        estimatedAreaM2: 12500,
        irrigation: "rainfed",
        estimatedTreeCount: 240,
        position: { lat: 37.0215, lon: 37.795, uncertaintyM: 100 },
        boundary: SQUARE,
        ownerProfileId: "a0000000-0000-4000-8000-000000000001",
      },
    });
  });

  it("m² wins over dönüm; irrigation defaults to unknown", () => {
    const result = parseParcelForm(reader({ name: "A", area_m2: "9500", area_donum: "1" }));
    expect(result.ok && result.value).toMatchObject({
      estimatedAreaM2: 9500,
      irrigation: "unknown",
    });
  });

  it("reports each bad field", () => {
    const result = parseParcelForm(
      reader({
        area_m2: "-3",
        tree_count: "12.5",
        lat: "95",
        lon: "",
        boundary: JSON.stringify([SQUARE[0], SQUARE[2], SQUARE[1], SQUARE[3]]),
        owner_profile_id: "nope",
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "required",
        area_m2: "invalid",
        tree_count: "invalid",
        lat: "invalid",
        lon: "invalid",
        boundary: "self_intersecting",
        owner_profile_id: "invalid",
      },
    });
  });
});

describe("parcel detail form", () => {
  it("cleans the private detail", () => {
    const result = parseDetailForm(
      reader({
        deed_block: "101",
        deed_parcel: "7",
        is_shared_deed: "yes",
        authorization_basis: "power_of_attorney",
        entry_permission_at: "2026-10-21",
        site_contact_name: "Bekçi",
        site_contact_phone: "0533 000 00 99",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        deedBlock: "101",
        deedParcel: "7",
        isSharedDeed: true,
        usedPortionNote: null,
        authorizationBasis: "power_of_attorney",
        entryPermissionAt: "2026-10-21T12:00:00Z",
        accessNote: null,
        siteContactName: "Bekçi",
        siteContactPhone: "+905330000099",
      },
    });
  });

  it("rejects an unknown basis, a bad day and a bad phone", () => {
    const result = parseDetailForm(
      reader({
        authorization_basis: "rumour",
        entry_permission_at: "2026-02-30",
        site_contact_phone: "x",
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        authorization_basis: "invalid",
        entry_permission_at: "invalid",
        site_contact_phone: "invalid",
      },
    });
  });
});

describe("visit form", () => {
  const today = "2026-10-21";
  const parcel = "c0000000-0000-4000-8000-000000000001";

  it("cleans a valid plan", () => {
    const result = parseVisitForm(
      reader({
        parcel_id: parcel,
        kind: "periodic_scan",
        planned_date: "2026-12-15",
        notes: " Kapı kilitli ",
      }),
      today,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        parcelId: parcel,
        kind: "periodic_scan",
        plannedDate: "2026-12-15",
        leadUserId: null,
        notes: "Kapı kilitli",
      },
    });
  });

  it("needs a parcel, a visit kind and a day that has not passed", () => {
    expect(parseVisitForm(reader({ kind: "mowing", planned_date: "2026-10-20" }), today)).toEqual({
      ok: false,
      errors: { parcel_id: "required", kind: "invalid", planned_date: "past" },
    });
    expect(
      parseVisitForm(reader({ parcel_id: parcel, kind: "inventory", planned_date: today }), today)
        .ok,
    ).toBe(true);
  });
});

describe("boundary rings", () => {
  it("parses JSON rings and drops the closing vertex", () => {
    expect(parseRing("")).toBeNull();
    expect(parseRing("{")).toBe("invalid");
    expect(parseRing("[[200, 37]]")).toBe("invalid");
    expect(parseRing(JSON.stringify([...SQUARE, SQUARE[0]]))).toEqual(SQUARE);
  });

  it("validates rings", () => {
    expect(validateRing(SQUARE)).toBeNull();
    expect(validateRing(SQUARE.slice(0, 2))).toBe("too_few");
    expect(validateRing([SQUARE[0], SQUARE[1], SQUARE[1], SQUARE[2]])).toBe("too_few");
    expect(validateRing([SQUARE[0], SQUARE[2], SQUARE[1], SQUARE[3]])).toBe("self_intersecting");
    // Collinear points enclose no area.
    expect(
      validateRing([
        [37.4, 37.02],
        [37.401, 37.02],
        [37.402, 37.02],
      ]),
    ).toBe("too_few");
  });

  it("computes the area in m² and converts dönüm", () => {
    // 0.001° lon x 0.001° lat at 37.02 N: 88.8 m x 111.2 m.
    expect(ringAreaM2(SQUARE)).toBeGreaterThan(9800);
    expect(ringAreaM2(SQUARE)).toBeLessThan(9950);
    expect(donumToM2(12.5)).toBe(12500);
    expect(m2ToDonum(9500)).toBe(9.5);
  });
});

describe("visits", () => {
  const row = (over: Partial<VisitRow> & { id: string }): VisitRow => ({
    kind: "periodic_scan",
    status: "planned",
    planned_date: null,
    started_at: null,
    ended_at: null,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  });

  it("dates: today in Turkey, day arithmetic, validation", () => {
    // 22:30 UTC on 21 October is already 22 October in Turkey (UTC+3).
    expect(todayIn(new Date("2026-10-21T22:30:00Z"))).toBe("2026-10-22");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("season of scan visits from their day; none for inventory", () => {
    expect(visitSeason("periodic_scan", "2027-01-20")).toBe("winter");
    expect(visitSeason("verification", "2027-04-10")).toBe("spring");
    expect(visitSeason("periodic_scan", "2027-07-01")).toBe("summer");
    expect(visitSeason("periodic_scan", "2026-10-31")).toBe("harvest");
    expect(visitSeason("periodic_scan", "2026-11-30")).toBe("winter");
    expect(visitSeason("inventory", "2027-01-20")).toBeNull();
    expect(visitSeason("periodic_scan", null)).toBeNull();
  });

  it("counts visits by status", () => {
    const counts = countByStatus([
      row({ id: "1" }),
      row({ id: "2", status: "captured" }),
      row({ id: "3", status: "published" }),
      row({ id: "4", status: "planned" }),
      row({ id: "5", status: "cancelled" }),
    ]);
    expect(counts).toEqual({ planned: 2, captured: 1, processed: 0, in_review: 0, published: 1 });
  });

  it("upcoming: planned visits within 14 days, soonest first", () => {
    const visits = [
      row({ id: "far", planned_date: "2026-11-05" }),
      row({ id: "edge", planned_date: "2026-11-04" }),
      row({ id: "today", planned_date: "2026-10-21" }),
      row({ id: "past", planned_date: "2026-10-20" }),
      row({ id: "done", planned_date: "2026-10-25", status: "captured" }),
    ];
    expect(upcomingVisits(visits, "2026-10-21").map((v) => v.id)).toEqual(["today", "edge"]);
  });

  it("overdue: planned past their day, captured and unprocessed for more than 3 days", () => {
    const now = new Date("2026-10-21T09:00:00Z");
    const visits = [
      row({ id: "late-planned", planned_date: "2026-10-18" }),
      row({ id: "today", planned_date: "2026-10-21" }),
      row({
        id: "late-capture",
        status: "captured",
        started_at: "2026-10-16T06:00:00Z",
        ended_at: "2026-10-16T08:00:00Z",
      }),
      row({ id: "fresh-capture", status: "captured", ended_at: "2026-10-19T08:00:00Z" }),
      row({ id: "processed", status: "processed", ended_at: "2026-10-01T08:00:00Z" }),
    ];
    expect(overdueVisits(visits, now).map((o) => [o.visit.id, o.reason, o.days])).toEqual([
      ["late-capture", "waiting_processing", 5],
      ["late-planned", "past_due", 3],
    ]);
  });

  it("capture time: end, else start, else planned day", () => {
    expect(capturedAt(row({ id: "a", ended_at: "2026-10-02T00:00:00Z", started_at: "x" }))).toBe(
      "2026-10-02T00:00:00Z",
    );
    expect(capturedAt(row({ id: "b", planned_date: "2026-10-03" }))).toBe("2026-10-03T00:00:00Z");
    expect(capturedAt(row({ id: "c" }))).toBeNull();
  });
});

describe("results in URLs and database errors", () => {
  it("builds addresses with a notice and reads back only known codes", () => {
    const href = opsHref.parcel("p1", { notice: "registered" });
    expect(href).toBe("/operasyon/parsel/p1?bilgi=registered");
    expect(readResult({ bilgi: "registered", hata: "forbidden", sinir: "2" })).toEqual({
      notice: "registered",
      error: "forbidden",
      boundary: 2,
    });
    expect(readResult({ bilgi: "<script>", hata: "anything", sinir: "-1" })).toEqual({
      notice: undefined,
      error: undefined,
      boundary: undefined,
    });
    expect(opsHref.visits({ parsel: "p1", durum: null })).toBe("/operasyon/ziyaret?parsel=p1");
  });

  it("maps database errors to reasons without their text", () => {
    expect(reasonOf({ code: "P0001", message: "visit_not_planned" })).toBe("visit_not_planned");
    expect(reasonOf({ code: "42501", message: "new row violates row-level security policy" })).toBe(
      "forbidden",
    );
    expect(reasonOf({ code: "23505", message: "duplicate key value" })).toBe("exists");
    expect(reasonOf({ code: "23514", message: "Failing row contains (+905321234567)" })).toBe(
      "write_failed",
    );
    expect(reasonOf(null)).toBe("write_failed");
  });

  it("knows the garden removal codes of the visit and life cycle forms (IP14)", () => {
    for (const code of ["parcel_removal_scheduled", "parcel_removed"] as const) {
      expect(reasonOf({ code: "P0001", message: code })).toBe(code);
      expect(readResult({ hata: code }).error).toBe(code);
      expect(tr.operations.errors[code]).toBeTruthy();
    }
  });
});

describe("Turkish labels of the operations screens", () => {
  const enums = Constants.public.Enums;
  it.each([
    ["irrigation_type", enums.irrigation_type, tr.operations.irrigation],
    ["parcel_role", enums.parcel_role, tr.operations.parcelRole],
    ["season", enums.season, tr.operations.season],
    ["boundary_source", enums.boundary_source, tr.operations.parcel.boundarySource],
    ["visit kinds", VISIT_KINDS, tr.operations.visitKind],
    ["contact preferences", CONTACT_PREFERENCES, tr.operations.contactPreference],
    ["authorization bases", AUTHORIZATION_BASES, tr.operations.authorizationBasis],
    ["field errors", FIELD_ERRORS, tr.operations.fieldErrors],
    ["notices", NOTICES, tr.operations.notices],
  ] as const)("labels every %s value", (_name, values, labels) => {
    for (const value of values) expect(labels[value as keyof typeof labels]).toBeTruthy();
  });
});
