import { describe, expect, it } from "vitest";
import { isExplicitConsentAsked, MARKETING_CONSENT_ENABLED } from "./consents";

describe("optional explicit consents", () => {
  it("never asks the service-improvement consent (kararlar.md H31)", () => {
    expect(isExplicitConsentAsked("explicit_service_improvement")).toBe(false);
  });

  it("asks marketing only once İYS is in place (kararlar.md H06, T22)", () => {
    expect(MARKETING_CONSENT_ENABLED).toBe(false);
    expect(isExplicitConsentAsked("explicit_marketing")).toBe(MARKETING_CONSENT_ENABLED);
  });
});
