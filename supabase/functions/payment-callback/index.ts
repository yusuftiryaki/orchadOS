// payment-callback: where iyzico's Checkout Form (or the fake checkout page)
// POSTs the browser back after payment. A cross-site POST without a session:
// verify_jwt is off and only the token is trusted. The result is asked from the
// provider (retrieve), written with payment_finalize, and the browser is sent
// to the result page.
//
// POST /functions/v1/payment-callback   token=…[&outcome=success|failure|review (fake only)]
//   -> 303 <return_origin>/portal/odeme/<id>
//   -> 303 <PORTAL_BASE_URL>/portal/odeme?hata=odeme_bulunamadi (unknown token,
//      or a fake payment while the fake provider is locked; nothing is written)
//
// Logic: ../_shared/payments/handlers.ts.

import { envFrom, handleCallback } from "../_shared/payments/handlers.ts";

Deno.serve((req) => handleCallback(req, { env: envFrom((key) => Deno.env.get(key)) }));
