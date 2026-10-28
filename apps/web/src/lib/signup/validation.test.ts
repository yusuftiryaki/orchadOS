import { describe, expect, it } from "vitest";
import { MARKETING_CONSENT_ENABLED } from "@/lib/legal/consents";
import { parseSignupForm } from "./validation";

const VALID: Record<string, string> = {
  full_name: "  Ayşe   Yılmaz ",
  phone: "0532 123 45 67",
  email: "Ayse@Example.com ",
  password: "fistik-2026",
  password_repeat: "fistik-2026",
  contact_preference: "whatsapp",
  kvkk_notice: "on",
};

const reader =
  (values: Record<string, string>) =>
  (name: string): string =>
    values[name] ?? "";

const parse = (overrides: Record<string, string | undefined> = {}) => {
  const values: Record<string, string> = { ...VALID };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete values[k];
    else values[k] = v;
  }
  return parseSignupForm(reader(values));
};

const errorsOf = (overrides: Record<string, string | undefined>) => {
  const result = parse(overrides);
  if (result.ok) throw new Error("expected errors");
  return result.errors;
};

describe("parseSignupForm", () => {
  it("normalizes a valid form; optional consents default to unchecked", () => {
    const result = parse();
    expect(result).toEqual({
      ok: true,
      value: {
        fullName: "Ayşe Yılmaz",
        phone: "+905321234567",
        email: "ayse@example.com",
        password: "fistik-2026",
        contactPreference: "whatsapp",
        explicitServiceImprovement: false,
        explicitMarketing: false,
      },
    });
  });

  // docs/hukuk/kararlar.md H06, H31: a consent the form does not ask is never
  // recorded as given, whatever the request carries.
  it("records a consent that is not asked as not given", () => {
    const result = parse({ explicit_service_improvement: "on", explicit_marketing: "on" });
    expect(result.ok && result.value.explicitServiceImprovement).toBe(false);
    expect(result.ok && result.value.explicitMarketing).toBe(MARKETING_CONSENT_ENABLED);
  });

  it("has no AI-transfer consent", () => {
    const result = parse({ explicit_ai_transfer: "on" });
    expect(result.ok && Object.keys(result.value)).not.toContain("explicitAiTransfer");
  });

  it("reports every missing field on an empty form", () => {
    expect(parseSignupForm(reader({}))).toEqual({
      ok: false,
      errors: {
        full_name: "required",
        phone: "required",
        email: "required",
        password: "required",
        password_repeat: "required",
        contact_preference: "required",
        kvkk_notice: "required",
      },
    });
  });

  it("requires the KVKK notice box", () => {
    expect(errorsOf({ kvkk_notice: undefined })).toEqual({ kvkk_notice: "required" });
  });

  it.each([
    ["foreign mobile", "+49 151 23456789"],
    ["Turkish landline", "0342 123 45 67"],
    ["too short", "0532 123"],
    ["letters", "0532 ABC 45 67"],
  ])("rejects a non-TR-mobile phone (%s)", (_label, phone) => {
    expect(errorsOf({ phone })).toEqual({ phone: "invalid" });
  });

  it.each(["+905321234567", "5321234567", "0090 532 123 45 67"])("accepts %s", (phone) => {
    const result = parse({ phone });
    expect(result.ok && result.value.phone).toBe("+905321234567");
  });

  it("checks name length", () => {
    expect(errorsOf({ full_name: "A" })).toEqual({ full_name: "too_short" });
    expect(errorsOf({ full_name: "A".repeat(121) })).toEqual({ full_name: "too_long" });
    expect(parse({ full_name: "Ab" }).ok).toBe(true);
  });

  it("checks the e-mail", () => {
    expect(errorsOf({ email: "ayse@" })).toEqual({ email: "invalid" });
  });

  it("checks the password and its repeat", () => {
    expect(errorsOf({ password: "kisa", password_repeat: "kisa" })).toEqual({
      password: "too_short",
    });
    expect(errorsOf({ password_repeat: "fistik-2027" })).toEqual({
      password_repeat: "mismatch",
    });
  });

  it("offers only WhatsApp and SMS as contact preference", () => {
    expect(errorsOf({ contact_preference: "phone_call" })).toEqual({
      contact_preference: "invalid",
    });
    expect(parse({ contact_preference: "sms" }).ok).toBe(true);
  });

  it("never echoes values in errors", () => {
    const errors = errorsOf({ phone: "+49 151 23456789", email: "x@" });
    expect(JSON.stringify(errors)).not.toMatch(/49|x@/);
  });
});
