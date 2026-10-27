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
