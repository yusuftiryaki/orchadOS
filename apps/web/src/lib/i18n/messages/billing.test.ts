import { describe, expect, it } from "vitest";
import { BILLING_ERRORS } from "@/lib/billing/errors";
import {
  CUSTOMER_REMOVAL_REASONS,
  GARDEN_STATES,
  PARCEL_SERVICE_STATUSES,
  REMOVAL_REFUND_MODES,
} from "@/lib/billing/types";
import { Constants } from "@/lib/database.types";
import { billingText } from "./billing";

// Every IP12 enum value shown on a screen needs a Turkish label.
describe("billing messages", () => {
  const enums = Constants.public.Enums;

  it.each([
    ["application_status", enums.application_status, billingText.applicationStatus],
    [
      "application_rejection_reason",
      enums.application_rejection_reason,
      billingText.rejectionReason,
    ],
    ["quote_status", enums.quote_status, billingText.quoteStatus],
    ["order_status", enums.order_status, billingText.orderStatus],
    ["payment_provider", enums.payment_provider, billingText.paymentProvider],
    ["payment_status", enums.payment_status, billingText.paymentStatus],
    ["refund_kind", enums.refund_kind, billingText.refundKind],
    ["refund_status", enums.refund_status, billingText.refundStatus],
    ["refund_reason", enums.refund_reason, billingText.refundReason],
    ["price_list_status", enums.price_list_status, billingText.priceListStatus],
    ["billing_party_kind", enums.billing_party_kind, billingText.billingPartyKind],
    ["consent_kind", enums.consent_kind, billingText.consentKind],
    ["consent_source", enums.consent_source, billingText.consentSource],
    ["garden_removal_status", enums.garden_removal_status, billingText.gardenRemovalStatus],
    ["garden_removal_reason", enums.garden_removal_reason, billingText.gardenRemovalReason],
  ] as const)("labels every %s value", (_name, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const value of values) {
      expect(labels[value as keyof typeof labels]).toBeTruthy();
    }
  });

  it.each([
    ["my_gardens.state", GARDEN_STATES, billingText.gardenState],
    ["parcel_service_status.status", PARCEL_SERVICE_STATUSES, billingText.parcelServiceStatus],
    ["garden_removal.refund_mode", REMOVAL_REFUND_MODES, billingText.removalRefundMode],
  ] as const)("labels every %s value (IP14)", (_name, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
  });

  it("customers choose only their own removal reasons", () => {
    expect(CUSTOMER_REMOVAL_REASONS).not.toContain("transfer");
    expect(CUSTOMER_REMOVAL_REASONS).not.toContain("duplicate");
    for (const reason of CUSTOMER_REMOVAL_REASONS) {
      expect(billingText.gardenRemovalReason[reason]).toBeTruthy();
    }
  });

  it("explains every billing error", () => {
    expect(Object.keys(billingText.errors).sort()).toEqual([...BILLING_ERRORS].sort());
    for (const code of BILLING_ERRORS) expect(billingText.errors[code]).toBeTruthy();
  });
});
