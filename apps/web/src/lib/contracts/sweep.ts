import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Client } from "@/lib/supabase/types";
import { ensureOrderDocuments, type EnsureResult } from "./generate";
import type { OrderRef } from "./load";
import { storeEnv, type StoreEnv } from "./store";

// The automatic sweep of missing contract documents (docs/musteri-yonetimi.md
// "Sözleşme belgeleri (T04)", docs/hukuk/kararlar.md H12). pg_cron
// (private.dispatch_contract_document_sweep) stores a short-lived ticket for at
// most 5 orders and POSTs it here with the cron secret. The Next server has no
// service key: it reads the ticket's orders (sweep_contract_orders) and their
// acceptance snapshots with the anon key and the ticket header, renders the
// missing PDFs from the snapshots and uploads them through the system mode of
// the contract-documents Edge Function, which re-checks every document. The
// response and the logs carry counts only: no personal data, no order ids.

export const SWEEP_TICKET_HEADER = "x-orchados-sweep-ticket";
export const CRON_SECRET_HEADER = "x-orchados-cron-secret";
// Stays within the route's maxDuration (60 s) with one Edge timeout to spare.
export const SWEEP_BUDGET_MS = 35_000;

const TICKET = /^[0-9a-f]{64}$/;

// Constant-time comparison of the cron secret; false when none is set.
export function cronSecretMatches(sent: string | null, expected: string | undefined): boolean {
  if (!expected || !sent) return false;
  const a = Buffer.from(sent, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseTicket(body: unknown): string | null {
  const ticket =
    body && typeof body === "object" ? (body as Record<string, unknown>).ticket : undefined;
  return typeof ticket === "string" && TICKET.test(ticket) ? ticket : null;
}

export function ticketClient(ticket: string, env: StoreEnv = storeEnv()): Client {
  return createSupabaseClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { [SWEEP_TICKET_HEADER]: ticket } },
  });
}

export interface SweepSummary {
  orders: number;
  created: number;
  existing: number;
  failed: number;
  manualCopy: number;
  skipped: number;
}

export async function runSweep(
  ticket: string,
  options: { env?: StoreEnv; now?: () => number; budgetMs?: number } = {},
): Promise<SweepSummary> {
  const env = options.env ?? storeEnv();
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? SWEEP_BUDGET_MS);
  const supabase = ticketClient(ticket, env);
  const summary: SweepSummary = {
    orders: 0,
    created: 0,
    existing: 0,
    failed: 0,
    manualCopy: 0,
    skipped: 0,
  };
  const { data, error } = await supabase.rpc("sweep_contract_orders");
  if (error) throw new Error("sweep_orders_unreadable");
  for (const row of data ?? []) {
    if (now() > deadline) {
      summary.skipped += 1;
      continue;
    }
    summary.orders += 1;
    const order: OrderRef = {
      id: row.order_id,
      orgId: row.org_id,
      customerUserId: row.customer_user_id,
      number: row.order_number,
      acceptedAt: row.accepted_at,
      activatedAt: row.activated_at ?? null,
      serviceStart: row.service_start ?? null,
      serviceEnd: row.service_end ?? null,
    };
    let result: EnsureResult | null = null;
    try {
      result = await ensureOrderDocuments(supabase, "ops", order.id, {
        auth: { sweep: true },
        env,
        source: { order, documents: (row.existing ?? []).map((kind) => ({ kind })) },
      });
    } catch {
      summary.failed += 1;
      continue;
    }
    summary.created += result.created.length;
    summary.existing += result.existing.length;
    summary.failed += result.failed.length;
    if (result.manualCopy) summary.manualCopy += 1;
  }
  return summary;
}
