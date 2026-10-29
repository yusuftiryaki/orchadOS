import type { PortalError } from "./urls";

// Helpers of the card payment start (docs/musteri-yonetimi.md §8.4). The
// `payments` function checks the return origin against its own allow list;
// here it is only derived from the request.

type HeaderBag = { get(name: string): string | null };

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// "<proto>://<host>" of the request as the browser sent it (behind a proxy:
// the forwarded headers). Null when the host is malformed.
export function returnOriginOf(h: HeaderBag): string | null {
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const forwarded = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  const proto = forwarded === "https" || forwarded === "http" ? forwarded : "http";
  if (!HOST_RE.test(host)) return null;
  return `${proto}://${host}`;
}

const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:.]{2,45})$/;

// The visitor's IP for the provider's fraud checks; the platform's proxy sets
// x-forwarded-for. Falls back to the loopback address (local runs).
export function clientIpOf(h: HeaderBag): string {
  const candidate =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return IP_RE.test(candidate) ? candidate : "127.0.0.1";
}

const START_ERRORS: Record<string, PortalError> = {
  invalid_input: "invalid_input",
  not_found: "not_found",
  unauthorized: "forbidden",
  order_not_payable: "order_not_payable",
  billing_profile_incomplete: "billing_profile_incomplete",
  payment_in_progress: "payment_in_progress",
  provider_error: "provider_error",
  payments_disabled: "payments_disabled",
  // IP14 (docs/bahce-yonetimi.md §9.6, payment_begin).
  garden_removal_open: "garden_removal_open",
  addon_base_closed: "addon_base_closed",
  // T13: the org needs a TCKN and none (or a malformed one) came with the start.
  identity_number_required: "identity_number_required",
};

// The reason of a failed `payments` start: the function answers
// {error: code} (§8.4), with field "email" when the buyer has no e-mail; a
// network failure is write_failed.
export async function paymentStartError(error: unknown): Promise<PortalError> {
  const response = (error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const body = (await response.clone().json()) as { error?: unknown; field?: unknown };
      if (body.error === "billing_profile_incomplete" && body.field === "email")
        return "fatura_eposta_eksik";
      if (typeof body.error === "string" && START_ERRORS[body.error])
        return START_ERRORS[body.error];
    } catch {
      // Not JSON: fall through.
    }
    if (response.status === 503) return "payments_disabled";
    if (response.status === 502) return "provider_error";
  }
  return "write_failed";
}
