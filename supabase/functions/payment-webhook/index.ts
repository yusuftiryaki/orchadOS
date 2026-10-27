// payment-webhook: iyzico webhook V3 notifications (header x-iyz-signature-v3),
// or signed fake notifications (x-fake-signature) when the fake provider is
// unlocked. verify_jwt is off; the signature is the authentication.
//
// POST /functions/v1/payment-webhook
//   -> 200 {ok:true}
//   -> 401 {error:"invalid_signature"}: only the reason code is logged and
//      nothing is written to the database.
//
// A valid notification is recorded once (dedup key); a new one is confirmed
// with the provider and written with payment_finalize.
//
// Logic: ../_shared/payments/handlers.ts.

import { envFrom, handleWebhook } from "../_shared/payments/handlers.ts";

Deno.serve((req) => handleWebhook(req, { env: envFrom((key) => Deno.env.get(key)) }));
