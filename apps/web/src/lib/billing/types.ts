import type { Database, Tables } from "@/lib/database.types";

// Rows of the billing tables as API users read them (BILLING_COLUMNS): the
// internal columns that are not granted (docs/musteri-yonetimi.md §6.8) are
// left out of the customer tables.

export type ServiceApplication = Omit<Tables<"service_application">, "ops_note" | "decided_by">;
export type ApplicationGarden = Omit<
  Tables<"application_garden">,
  "verified_by" | "verification_note"
>;
export type Quote = Omit<Tables<"quote">, "issued_by" | "decided_by">;
export type QuoteItem = Tables<"quote_item">;
export type ServiceOrder = Omit<Tables<"service_order">, "termination_note">;
export type ServiceOrderItem = Tables<"service_order_item">;
export type Payment = Omit<
  Tables<"payment">,
  "provider_token" | "return_origin" | "recorded_by" | "manual_note"
>;
export type PaymentItem = Tables<"payment_item">;
export type Refund = Omit<Tables<"refund">, "note" | "requested_by">;
// IP14: a garden leaving the service (docs/bahce-yonetimi.md §9.4).
export type GardenRemoval = Omit<
  Tables<"garden_removal">,
  "ops_note" | "requested_by" | "decided_by" | "blocked_reason" | "revoke_all_access"
>;

// Ops-only tables (every column is granted).
export type ServicePackage = Tables<"service_package">;
export type PriceList = Tables<"price_list">;
export type PriceListItem = Tables<"price_list_item">;
export type OrgBillingSetting = Tables<"org_billing_setting">;
export type AuditEvent = Tables<"audit_event">;

type Enums = Database["public"]["Enums"];
export type ApplicationStatus = Enums["application_status"];
export type ApplicationRejectionReason = Enums["application_rejection_reason"];
export type QuoteStatus = Enums["quote_status"];
export type OrderStatus = Enums["order_status"];
export type PaymentProvider = Enums["payment_provider"];
export type PaymentStatus = Enums["payment_status"];
export type RefundKind = Enums["refund_kind"];
export type RefundStatus = Enums["refund_status"];
export type RefundReason = Enums["refund_reason"];
export type PriceListStatus = Enums["price_list_status"];
export type BillingPartyKind = Enums["billing_party_kind"];
export type ConsentKind = Enums["consent_kind"];
export type ConsentSource = Enums["consent_source"];
export type GardenRemovalStatus = Enums["garden_removal_status"];
export type GardenRemovalReason = Enums["garden_removal_reason"];

// IP14 reads (docs/bahce-yonetimi.md §9.6).
type Functions = Database["public"]["Functions"];
export type ServicePeriod = Functions["my_service_period"]["Returns"][number];
export type CustomerGarden = Functions["my_gardens"]["Returns"][number];
export type ParcelServiceStatus = Functions["parcel_service_status"]["Returns"][number];
export type OpsGardenRemoval = Functions["ops_garden_removals"]["Returns"][number];

// my_gardens.state and parcel_service_status.status.
export const GARDEN_STATES = ["in_service", "leaving", "upcoming", "removed"] as const;
export type GardenState = (typeof GARDEN_STATES)[number];
export const PARCEL_SERVICE_STATUSES = ["in_service", "leaving", "removed", "none"] as const;
export type ParcelServiceStatusValue = (typeof PARCEL_SERVICE_STATUSES)[number];

// Reasons the customer may choose; transfer and duplicate are ops'.
export const CUSTOMER_REMOVAL_REASONS = [
  "sold",
  "not_needed",
  "dissatisfied",
  "cost",
  "other",
] as const satisfies readonly GardenRemovalReason[];

// garden_removal.refund_mode (removal-v1, §7.1).
export const REMOVAL_REFUND_MODES = [
  "unused_visits",
  "withdrawal",
  "duplicate",
  "manual",
  "none",
] as const;
export type RemovalRefundMode = (typeof REMOVAL_REFUND_MODES)[number];
