import { NextResponse, type NextRequest } from "next/server";
import { CRON_SECRET_HEADER, cronSecretMatches, parseTicket, runSweep } from "@/lib/contracts/sweep";

// POST /sistem/sozlesme-tarama: the automatic sweep of missing contract
// documents (T04, H12), called by pg_cron through pg_net with the cron secret
// (Vault orchados_cron_secret = ORCHADOS_CRON_SECRET here) and a ticket. A
// public path (src/lib/site/public-paths.ts): there is no session; the secret
// is checked in constant time. Responses carry counts only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest) {
  const expected = process.env.ORCHADOS_CRON_SECRET || undefined;
  if (!expected) return json({ error: "not_configured" }, 503);
  if (!cronSecretMatches(request.headers.get(CRON_SECRET_HEADER), expected)) {
    return json({ error: "unauthorized" }, 401);
  }
  const ticket = parseTicket(await request.json().catch(() => null));
  if (!ticket) return json({ error: "invalid_input" }, 400);
  try {
    return json({ status: "ok", ...(await runSweep(ticket)) });
  } catch {
    return json({ error: "failed" }, 500);
  }
}
