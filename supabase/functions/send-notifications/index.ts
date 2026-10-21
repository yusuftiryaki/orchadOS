// send-notifications: works through the notification queue (public.notification).
//
// POST /functions/v1/send-notifications
//   Authorization: Bearer <service role key>   (pg_cron via pg_net, or tests)
//   { "limit"?: 1..100 }
//
// 1. notification_claim() takes due pending rows with the recipient's phone
//    (from private.owner_profile; never stored in the queue). It runs with the
//    caller's token and is granted to the service role only, so any other
//    caller gets 403.
// 2. Each message is rendered (Turkish template + portal link) and handed to
//    the provider: the record provider unless a real one is configured
//    (../_shared/providers.ts).
// 3. notification_report() writes the outcome. Temporary errors are retried
//    after 1, 4, 16, 60 minutes; after 5 attempts, or on a permanent error
//    (no phone, bad template, number rejected), the message is failed.
//
// Responses: 200 { claimed, sent, retried, failed } · 401 · 403 · 405 · 500
// Phone numbers and message texts are never logged.
//
// Environment: PORTAL_BASE_URL (portal address for links, e.g.
// https://orchados.vercel.app), provider variables (see providers.ts).

import { decideRetry, renderNotification } from "../_shared/messaging.ts";
import { chooseProvider, recordProvider } from "../_shared/providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") ?? "";

interface Claimed {
  id: string;
  channel: "sms" | "whatsapp";
  template: string;
  vars: Record<string, unknown>;
  attempts: number;
  phone: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function rpc(headers: Record<string, string>, name: string, args: unknown): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
}

async function report(
  headers: Record<string, string>,
  id: string,
  outcome: "sent" | "retry" | "failed",
  extra: { error?: string; retryAt?: Date; via?: string; providerMessageId?: string | null } = {},
) {
  const res = await rpc(headers, "notification_report", {
    p_id: id,
    p_outcome: outcome,
    p_error: extra.error ?? null,
    p_retry_at: extra.retryAt?.toISOString() ?? null,
    p_sent_via: extra.via ?? null,
    p_provider_message_id: extra.providerMessageId ?? null,
  });
  if (!res.ok) throw new Error(`notification_report failed with ${res.status}`);
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: "unauthorized" }, 401);

  let limit = 20;
  try {
    const body = await req.json();
    if (Number.isInteger(body?.limit)) limit = Math.min(Math.max(body.limit, 1), 100);
  } catch {
    // An empty body is fine.
  }

  const headers = { apikey: ANON_KEY, authorization };
  const counts = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  try {
    const claim = await rpc(headers, "notification_claim", { p_limit: limit });
    if (claim.status === 401 || claim.status === 403) return json({ error: "forbidden" }, 403);
    if (!claim.ok) throw new Error(`notification_claim failed with ${claim.status}`);
    const rows = (await claim.json()) as Claimed[];
    counts.claimed = rows.length;

    const provider = chooseProvider((name) => Deno.env.get(name), () => recordProvider(SUPABASE_URL, headers));

    for (const row of rows) {
      const now = new Date();
      let error: string;
      let permanent: boolean;

      const rendered = renderNotification(row.template, row.vars ?? {}, PORTAL_BASE_URL);
      if (!row.phone) {
        [error, permanent] = ["no_phone", true];
      } else if (!PORTAL_BASE_URL) {
        // Configuration, not the message: retry once it is set.
        [error, permanent] = ["no_portal_url", false];
      } else if (!rendered.ok) {
        [error, permanent] = [rendered.error, true];
      } else {
        const result = await provider.send({
          to: row.phone,
          channel: row.channel,
          body: rendered.body,
          purpose: "notification",
          notificationId: row.id,
        });
        if (result.ok) {
          await report(headers, row.id, "sent", { via: result.via, providerMessageId: result.providerMessageId });
          counts.sent++;
          continue;
        }
        [error, permanent] = [result.error, result.permanent];
      }

      const decision = decideRetry(row.attempts, permanent, now);
      if (decision.outcome === "retry") {
        await report(headers, row.id, "retry", { error, retryAt: decision.retryAt });
        counts.retried++;
      } else {
        await report(headers, row.id, "failed", { error });
        counts.failed++;
      }
    }
    return json(counts);
  } catch (error) {
    console.error("send-notifications:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "failed", ...counts }, 500);
  }
}

Deno.serve(handle);
