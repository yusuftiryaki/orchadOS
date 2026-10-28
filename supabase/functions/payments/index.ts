// payments: starts card payments, processes card refunds and reconciles open
// attempts (docs/musteri-yonetimi.md §8). verify_jwt is off; the caller is
// checked here.
//
// POST /functions/v1/payments
//   {action:"start", order_id, return_origin, client_ip}   Authorization: customer JWT
//     A demo visitor's token (app_metadata.demo) -> 403 demo_read_only, right
//     after the token check (docs/demo-turu.md §6.3).
//     -> 200 {payment_id, redirect_url} | 400 invalid_input | 401 | 403 demo_read_only | 404 |
//        409 order_not_payable|payment_in_progress|billing_profile_incomplete
//        (with field:"email" when the buyer has no e-mail) | 502 provider_error | 503 payments_disabled
//   {action:"refund", refund_id}                           Authorization: ops JWT
//     -> 200 {status:"succeeded"|"failed", kind, failure_code?, retryable?} | 403 | 404 | 409 refund_not_open | 503
//   {action:"reconcile"}                                   x-orchados-cron-secret
//     -> 200 {checked, finalized} | 401
//
// Logic: ../_shared/payments/handlers.ts. Buyer data, card data and tokens are
// never logged.

import { envFrom, handlePayments } from "../_shared/payments/handlers.ts";

Deno.serve((req) => handlePayments(req, { env: envFrom((key) => Deno.env.get(key)) }));
