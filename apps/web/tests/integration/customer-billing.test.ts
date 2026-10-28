import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BILLING_COLUMNS } from "@/lib/billing/columns";
import type { Json } from "@/lib/database.types";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import {
  check,
  createCustomer,
  GARDEN,
  GARDEN_DETAIL,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { BILLING_SEED, SEED, serviceClient } from "./fixtures";

// The customer functions behind the portal's account and application forms
// (IP12-D): the masked billing profile, consents, the garden limits and
// errors, and the contact update. Errors carry a code and at most a field
// name, never the typed value (KVKK).

const DOMAIN = "customer-billing-test.example.test";
const TCKN = "10000000146";

let customer: TestCustomer;

beforeAll(async () => {
  await removeCustomers(DOMAIN);
  customer = await createCustomer(DOMAIN);
});

afterAll(async () => {
  await serviceClient()
    .from("org_billing_setting")
    .update({ identity_number_required: false })
    .eq("org_id", SEED.org);
  await removeCustomers(DOMAIN);
});

const noValue = (error: { message?: string; details?: string | null } | null, value: string) => {
  expect(error).not.toBeNull();
  expect(`${error?.message} ${error?.details}`).not.toContain(value);
};

describe("billing profile", () => {
  it("is read masked; the TCKN is stored only while the org needs it", async () => {
    const c = customer.client;
    const before = check(await c.rpc("my_billing_profile"))[0];
    expect(before).toMatchObject({
      has_profile: true,
      identity_number_required: false,
      identity_number_masked: null,
    });

    check(
      await serviceClient()
        .from("org_billing_setting")
        .update({ identity_number_required: true })
        .eq("org_id", SEED.org),
    );
    const required = check(await c.rpc("my_billing_profile"))[0];
    expect(required.identity_number_required).toBe(true);

    const profile = {
      kind: "individual",
      first_name: "Test",
      last_name: "Müşteri",
      address: "Test Mah. 1. Sok. No: 2",
      city: "Gaziantep",
    };
    // A wrong number: refused with the field name only.
    const wrong = await c.rpc("customer_save_billing_profile", {
      p_profile: { ...profile, identity_number: "10000000147" },
    });
    expect(wrong.error).toMatchObject({ message: "invalid_input", details: "identity_number" });
    noValue(wrong.error, "10000000147");
    // Missing while required.
    const missing = await c.rpc("customer_save_billing_profile", { p_profile: profile });
    expect(missing.error).toMatchObject({ message: "invalid_input", details: "identity_number" });

    check(
      await c.rpc("customer_save_billing_profile", {
        p_profile: { ...profile, identity_number: TCKN },
      }),
    );
    const masked = check(await c.rpc("my_billing_profile"))[0];
    expect(masked.identity_number_masked).toBe("*******0146");
    expect(JSON.stringify(masked)).not.toContain(TCKN);
    // An omitted number keeps the stored one.
    check(
      await c.rpc("customer_save_billing_profile", { p_profile: { ...profile, city: "Nizip" } }),
    );
    expect(check(await c.rpc("my_billing_profile"))[0]).toMatchObject({
      city: "Nizip",
      identity_number_masked: "*******0146",
    });
    check(
      await serviceClient()
        .from("org_billing_setting")
        .update({ identity_number_required: false })
        .eq("org_id", SEED.org),
    );
  });

  it("rejects a malformed company profile by field", async () => {
    const result = await customer.client.rpc("customer_save_billing_profile", {
      p_profile: {
        kind: "company",
        first_name: "Test",
        last_name: "Müşteri",
        address: "Adres",
        city: "Gaziantep",
        company_title: "Fıstık A.Ş.",
        tax_office: "Nizip",
        tax_number: "12345",
      },
    });
    expect(result.error).toMatchObject({ message: "invalid_input", details: "tax_number" });
    noValue(result.error, "12345");
  });
});

describe("consents", () => {
  // T27 (docs/hukuk/kararlar.md H06, H31): the customer's own JWT cannot
  // grant a consent that is not asked; withdrawing always works and
  // my_consents returns the latest record per kind.
  it("an unasked explicit consent is refused; a withdrawal is recorded", async () => {
    const c = customer.client;
    for (const kind of ["explicit_marketing", "explicit_service_improvement"]) {
      const refused = await c.rpc("customer_set_consent", {
        p_kind: kind,
        p_granted: true,
        p_text_version: LEGAL_TEXT_VERSIONS.explicit_consent,
      });
      expect(refused.error).toMatchObject({ message: "consent_not_asked", details: kind });
    }
    check(
      await c.rpc("customer_set_consent", {
        p_kind: "explicit_marketing",
        p_granted: false,
        p_text_version: LEGAL_TEXT_VERSIONS.explicit_consent,
      }),
    );
    const rows = check(await c.rpc("my_consents")).filter((r) => r.kind === "explicit_marketing");
    const latest = rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
    expect(latest).toMatchObject({ granted: false, source: "portal" });
    expect(rows.every((r) => r.granted === false)).toBe(true);
  });

  it("the KVKK notice is only acknowledged, never withdrawn", async () => {
    const c = customer.client;
    const refused = await c.rpc("customer_set_consent", {
      p_kind: "kvkk_notice",
      p_granted: false,
      p_text_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
    });
    expect(refused.error?.message).toBe("invalid_input");
    check(
      await c.rpc("customer_set_consent", {
        p_kind: "kvkk_notice",
        p_granted: true,
        p_text_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
      }),
    );
    const kvkk = check(await c.rpc("my_consents")).filter((r) => r.kind === "kvkk_notice");
    expect(kvkk.some((r) => r.granted && r.text_version === LEGAL_TEXT_VERSIONS.kvkk_notice)).toBe(
      true,
    );
  });
});

describe("application gardens", () => {
  let application: string;

  beforeAll(async () => {
    application = check(
      await customer.client.rpc("customer_create_application", {
        p_package_id: BILLING_SEED.packages.standart,
      }),
    );
  });

  const save = (garden: Json, detail: Json = GARDEN_DETAIL) =>
    customer.client.rpc("customer_save_application_garden", {
      p_application_id: application,
      p_garden: garden,
      p_detail: detail,
    });

  it("checks the area, location, boundary and entry permission", async () => {
    expect((await save({ ...GARDEN, declared_area_m2: 400 })).error).toMatchObject({
      message: "invalid_input",
      details: "declared_area_m2",
    });
    expect((await save({ ...GARDEN, lon: null })).error?.message).toBe("invalid_input");
    expect(
      (
        await save({
          ...GARDEN,
          boundary: [
            [37.799, 37.0095],
            [37.801, 37.0105],
            [37.801, 37.0095],
            [37.799, 37.0105],
          ],
        })
      ).error?.message,
    ).toBe("boundary_invalid");
    expect((await save(GARDEN, { ...GARDEN_DETAIL, entry_permission: false })).error).toMatchObject(
      {
        message: "invalid_input",
        details: "entry_permission",
      },
    );
    const phone = await save(GARDEN, { ...GARDEN_DETAIL, site_contact_phone: "0532 999 88 77" });
    expect(phone.error).toMatchObject({ message: "invalid_input", details: "site_contact_phone" });
    noValue(phone.error, "999");
  });

  it("keeps the private detail out of the garden row and allows ten gardens", async () => {
    const first = check(
      await save(GARDEN, {
        ...GARDEN_DETAIL,
        access_note: "Anahtar bekçide",
        site_contact_name: "Ali",
      }),
    );
    const row = check(
      await customer.client
        .from("application_garden")
        .select(BILLING_COLUMNS.application_garden)
        .eq("id", first)
        .single(),
    );
    expect(JSON.stringify(row)).not.toContain("Anahtar");
    const detail = check(
      await customer.client.rpc("customer_application_garden_detail", { p_garden_id: first }),
    )[0];
    expect(detail).toMatchObject({ access_note: "Anahtar bekçide", site_contact_name: "Ali" });

    for (let i = 2; i <= 10; i++) check(await save({ ...GARDEN, name: `Bahçe ${i}` }));
    expect((await save({ ...GARDEN, name: "Bahçe 11" })).error?.message).toBe("too_many_gardens");

    check(await customer.client.rpc("customer_remove_application_garden", { p_garden_id: first }));
    check(await save({ ...GARDEN, name: "Yeniden 10" }));
  });

  it("is frozen once submitted", async () => {
    check(
      await customer.client.rpc("customer_submit_application", { p_application_id: application }),
    );
    expect((await save({ ...GARDEN, name: "Geç" })).error?.message).toBe("application_not_draft");
    check(
      await customer.client.rpc("customer_withdraw_application", { p_application_id: application }),
    );
  });
});

describe("contact", () => {
  it("customer_update_contact changes the name, contact e-mail and preference", async () => {
    const c = customer.client;
    check(
      await c.rpc("customer_update_contact", {
        p_full_name: "Yeni Ad Soyad",
        p_email: "Iletisim@Example.test",
        p_contact_preference: "whatsapp",
      }),
    );
    const profile = check(await c.rpc("my_owner_profile"))[0];
    expect(profile).toMatchObject({
      full_name: "Yeni Ad Soyad",
      email: "iletisim@example.test",
      contact_preference: "whatsapp",
    });
    // The login e-mail stays.
    const { data } = await c.auth.getUser();
    expect(data.user?.email).toBe(customer.email);

    const bad = await c.rpc("customer_update_contact", {
      p_full_name: "Yeni Ad Soyad",
      p_email: "gizli-deger@",
      p_contact_preference: "whatsapp",
    });
    expect(bad.error).toMatchObject({ message: "invalid_input", details: "email" });
    noValue(bad.error, "gizli-deger");
    const pref = await c.rpc("customer_update_contact", {
      p_full_name: "Yeni Ad Soyad",
      p_email: "",
      p_contact_preference: "fax",
    });
    expect(pref.error).toMatchObject({ message: "invalid_input", details: "contact_preference" });
  });
});
