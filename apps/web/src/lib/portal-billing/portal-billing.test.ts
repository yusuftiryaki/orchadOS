import { describe, expect, it } from "vitest";
import { clientIpOf, paymentStartError, returnOriginOf } from "./payments";
import { isValidTckn } from "./tckn";
import { portalHref, readPortalResult, safeBackPath } from "./urls";
import {
  m2ToDonumText,
  parseBillingProfileForm,
  parseContactForm,
  parseDonumToM2,
  parseGardenForm,
  parseScaledDecimal,
} from "./validation";

const reader = (values: Record<string, string>) => (name: string) => values[name] ?? "";

describe("dönüm and Turkish decimals", () => {
  it.each([
    ["20", 20000],
    ["12,5", 12500],
    ["0,75", 750],
    ["12.5", 12500],
    ["1.250", 1250000],
    ["1.250,5", 1250500],
    [" 3 ", 3000],
    ["2,125", 2125],
  ])("%s dönüm → %d m²", (input, m2) => {
    expect(parseDonumToM2(input)).toBe(m2);
  });

  it.each(["", "  "])("empty %j is null", (input) => {
    expect(parseDonumToM2(input)).toBeNull();
  });

  it.each(["abc", "-5", "1,2345", "1e3", "12,", "1.25.0"])("%j is invalid", (input) => {
    expect(parseDonumToM2(input)).toBe("invalid");
  });

  it("scales exactly without floating point", () => {
    expect(parseScaledDecimal("0,1", 3)).toBe(100);
    expect(parseScaledDecimal("0,3", 1)).toBe(3);
    expect(m2ToDonumText(12500)).toBe("12,5");
    expect(m2ToDonumText(null)).toBe("");
  });
});

describe("TCKN check digits", () => {
  it.each(["10000000146", "12345678950"])("%s is valid", (v) => {
    expect(isValidTckn(v)).toBe(true);
  });
  it.each(["10000000147", "01234567890", "1234567895", "1234567895a", "11111111111"])(
    "%s is invalid",
    (v) => {
      expect(isValidTckn(v)).toBe(false);
    },
  );
});

const GARDEN = {
  name: "Kuzey bahçe",
  province: "Gaziantep",
  district: "Nizip",
  village: "Kayalar",
  area_donum: "20",
  irrigation: "rainfed",
  estimated_tree_count: "300",
  lon: "37.8",
  lat: "37.01",
  boundary: JSON.stringify([
    [37.799, 37.0095],
    [37.801, 37.0095],
    [37.801, 37.0105],
  ]),
  authorization_basis: "title_holder",
  is_shared_deed: "no",
  entry_permission: "on",
  site_contact_phone: "0532 123 45 67",
};

describe("garden form", () => {
  it("produces exactly the jsonb keys of customer_save_application_garden", () => {
    const parsed = parseGardenForm(reader(GARDEN));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.value.garden).sort()).toEqual(
      [
        "name",
        "province",
        "district",
        "village",
        "declared_area_m2",
        "irrigation",
        "estimated_tree_count",
        "lon",
        "lat",
        "position_uncertainty_m",
        "boundary",
      ].sort(),
    );
    expect(Object.keys(parsed.value.detail).sort()).toEqual(
      [
        "authorization_basis",
        "deed_block",
        "deed_parcel",
        "is_shared_deed",
        "used_portion_note",
        "entry_permission",
        "access_note",
        "site_contact_name",
        "site_contact_phone",
      ].sort(),
    );
    expect(parsed.value.garden).toMatchObject({
      declared_area_m2: 20000,
      estimated_tree_count: 300,
      lon: 37.8,
      lat: 37.01,
    });
    expect(parsed.value.detail).toMatchObject({
      entry_permission: true,
      is_shared_deed: false,
      site_contact_phone: "+905321234567",
    });
  });

  it("requires the name, area, map location and entry permission", () => {
    const parsed = parseGardenForm(reader({}));
    expect(parsed).toEqual({
      ok: false,
      errors: {
        name: "required",
        area_donum: "required",
        position: "required",
        authorization_basis: "required",
        entry_permission: "required",
      },
    });
  });

  it("checks the area limits and the boundary", () => {
    const small = parseGardenForm(reader({ ...GARDEN, area_donum: "0,4" }));
    expect(small.ok ? null : small.errors.area_donum).toBe("too_small");
    const large = parseGardenForm(reader({ ...GARDEN, area_donum: "10.001" }));
    expect(large.ok ? null : large.errors.area_donum).toBe("too_large");
    const ring = parseGardenForm(
      reader({
        ...GARDEN,
        boundary: JSON.stringify([
          [37.79, 37.0],
          [37.8, 37.01],
        ]),
      }),
    );
    expect(ring.ok ? null : ring.errors.boundary).toBe("too_few");
    const noBoundary = parseGardenForm(reader({ ...GARDEN, boundary: "" }));
    expect(noBoundary.ok && noBoundary.value.garden.boundary).toBeNull();
  });

  it("never puts a typed value into an error", () => {
    const parsed = parseGardenForm(reader({ ...GARDEN, site_contact_phone: "abc-secret" }));
    expect(parsed.ok).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });
});

const PROFILE = {
  kind: "individual",
  first_name: "Ayşe",
  last_name: "Yılmaz",
  address: "Cumhuriyet Mah. 1. Sok. No: 2",
  district: "Nizip",
  city: "Gaziantep",
  postal_code: "27700",
};

describe("billing profile form", () => {
  it("leaves the TCKN out when the org does not need it", () => {
    const parsed = parseBillingProfileForm(reader({ ...PROFILE, identity_number: "10000000146" }), {
      identityRequired: false,
      hasIdentity: false,
    });
    expect(parsed.ok && "identity_number" in parsed.value).toBe(false);
  });

  it("asks for a valid TCKN only when it is required", () => {
    const missing = parseBillingProfileForm(reader(PROFILE), {
      identityRequired: true,
      hasIdentity: false,
    });
    expect(missing.ok ? null : missing.errors.identity_number).toBe("required");
    const kept = parseBillingProfileForm(reader(PROFILE), {
      identityRequired: true,
      hasIdentity: true,
    });
    expect(kept.ok && "identity_number" in kept.value).toBe(false);
    const wrong = parseBillingProfileForm(reader({ ...PROFILE, identity_number: "10000000147" }), {
      identityRequired: true,
      hasIdentity: false,
    });
    expect(wrong.ok ? null : wrong.errors.identity_number).toBe("invalid");
    const good = parseBillingProfileForm(
      reader({ ...PROFILE, identity_number: "100 000 001 46" }),
      {
        identityRequired: true,
        hasIdentity: false,
      },
    );
    expect(good.ok && good.value.identity_number).toBe("10000000146");
  });

  it("requires the company fields for a company", () => {
    const parsed = parseBillingProfileForm(reader({ ...PROFILE, kind: "company" }), {
      identityRequired: false,
      hasIdentity: false,
    });
    expect(parsed.ok ? null : parsed.errors).toEqual({
      company_title: "required",
      tax_office: "required",
      tax_number: "required",
    });
    const bad = parseBillingProfileForm(
      reader({
        ...PROFILE,
        kind: "company",
        company_title: "Fıstık A.Ş.",
        tax_office: "Nizip",
        tax_number: "12345",
      }),
      { identityRequired: false, hasIdentity: false },
    );
    expect(bad.ok ? null : bad.errors).toEqual({ tax_number: "invalid" });
  });

  it("rejects a malformed postal code and e-mail", () => {
    const parsed = parseBillingProfileForm(
      reader({ ...PROFILE, postal_code: "277", email: "x@" }),
      { identityRequired: false, hasIdentity: false },
    );
    expect(parsed.ok ? null : parsed.errors).toEqual({ postal_code: "invalid", email: "invalid" });
  });
});

describe("contact form", () => {
  it("parses the three fields of customer_update_contact", () => {
    expect(
      parseContactForm(
        reader({
          full_name: " Ayşe Yılmaz ",
          email: "AYSE@Example.com",
          contact_preference: "sms",
        }),
      ),
    ).toEqual({
      ok: true,
      value: { fullName: "Ayşe Yılmaz", email: "ayse@example.com", contactPreference: "sms" },
    });
    expect(parseContactForm(reader({ full_name: "A", contact_preference: "fax" }))).toEqual({
      ok: false,
      errors: { full_name: "invalid", contact_preference: "invalid" },
    });
  });
});

describe("portal addresses", () => {
  it("keeps only listed notice and error codes", () => {
    expect(readPortalResult({ bilgi: "basvuru_gonderildi", hata: "quote_expired" })).toEqual({
      notice: "basvuru_gonderildi",
      error: "quote_expired",
      missing: null,
    });
    expect(readPortalResult({ bilgi: "<script>", hata: ["odeme_bulunamadi"], eksik: "x" })).toEqual(
      { notice: null, error: "odeme_bulunamadi", missing: null },
    );
    expect(portalHref.application("a", { hata: "application_incomplete", eksik: "gardens" })).toBe(
      "/portal/basvuru/a?hata=application_incomplete&eksik=gardens",
    );
    expect(portalHref.application("a", { hata: "application_incomplete", eksik: "<x>" })).toBe(
      "/portal/basvuru/a?hata=application_incomplete",
    );
  });

  it("adds the return address to the billing profile link", () => {
    expect(portalHref.billing("/portal/teklif/abc")).toBe(
      "/portal/hesap/fatura?geri=%2Fportal%2Fteklif%2Fabc",
    );
    expect(portalHref.billing(null, { bilgi: "fatura_kaydedildi" })).toBe(
      "/portal/hesap/fatura?bilgi=fatura_kaydedildi",
    );
  });

  it("filters ?geri= with safeNextPath and keeps it in the portal", () => {
    expect(safeBackPath("/portal/teklif/abc")).toBe("/portal/teklif/abc");
    expect(safeBackPath(["/portal/siparis/1"])).toBe("/portal/siparis/1");
    for (const evil of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "evil.com",
      "/operasyon",
      "/portal\\..\\x",
      "",
      undefined,
    ]) {
      expect(safeBackPath(evil), String(evil)).toBeNull();
    }
  });
});

describe("payment start helpers", () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it("derives the return origin from the request", () => {
    expect(returnOriginOf(headers({ host: "127.0.0.1:3100" }))).toBe("http://127.0.0.1:3100");
    expect(
      returnOriginOf(
        headers({
          host: "internal:3000",
          "x-forwarded-host": "app.example.com",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://app.example.com");
    expect(returnOriginOf(headers({ host: "evil.com/x" }))).toBeNull();
    expect(returnOriginOf(headers({}))).toBeNull();
  });

  it("takes the first forwarded client IP, else loopback", () => {
    expect(clientIpOf(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIpOf(headers({ "x-forwarded-for": "<script>" }))).toBe("127.0.0.1");
    expect(clientIpOf(headers({}))).toBe("127.0.0.1");
  });

  it("maps the payments function's error codes", async () => {
    const err = (status: number, body: unknown) => ({
      context: new Response(JSON.stringify(body), { status }),
    });
    expect(await paymentStartError(err(409, { error: "order_not_payable" }))).toBe(
      "order_not_payable",
    );
    expect(await paymentStartError(err(409, { error: "billing_profile_incomplete" }))).toBe(
      "billing_profile_incomplete",
    );
    expect(await paymentStartError(err(503, { error: "payments_disabled" }))).toBe(
      "payments_disabled",
    );
    expect(await paymentStartError(err(502, "x"))).toBe("provider_error");
    expect(await paymentStartError(err(500, { error: "failed" }))).toBe("write_failed");
    expect(await paymentStartError(new Error("network"))).toBe("write_failed");
  });
});
