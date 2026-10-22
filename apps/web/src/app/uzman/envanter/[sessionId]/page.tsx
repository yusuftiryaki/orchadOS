import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryApproval, type ApprovalPanorama } from "@/components/expert/inventory-approval";
import { InventorySummaryView } from "@/components/office/inventory-summary";
import styles from "@/components/office/inventory.module.css";
import { requireSection } from "@/lib/auth/session";
import { getInventorySession } from "@/lib/expert/inventory";
import {
  CLOSE_TREE_M,
  codingChecks,
  hasCodingProblems,
  inventorySummary,
  type CodingChecks,
} from "@/lib/expert/inventory-checks";
import { sessionTime } from "@/lib/expert/season";
import { formatDate, t } from "@/lib/i18n";
import { loadCoverage } from "@/lib/expert/pipeline-checks";
import { loadInventoryWorkspace } from "@/lib/office/inventory-workspace";
import { officePanoramaSources } from "@/lib/office/panorama-source";
import { sourceOfSet } from "@/lib/office/panoramas";
import { createClient } from "@/lib/supabase/server";

// Expert's inventory approval (MVP Module 2, step 10): coded map, summary,
// coding checks, tree attributes, verification items, a panorama for spot
// checks, and the signature (approve_inventory).
export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireSection("uzman");
  const { sessionId } = await params;
  const supabase = await createClient();
  const session = await getInventorySession(supabase, sessionId);
  if (!session) notFound();
  const ws = await loadInventoryWorkspace(supabase, session.parcel_id);
  if (!ws) notFound();

  const checks = codingChecks(ws.slots);
  const summary = inventorySummary(ws.slots);
  const flagged = flaggedSlots(ws.slots, checks);

  // Panoramas of the inventory session for the spot check.
  const sources = officePanoramaSources(supabase, user.id);
  const sets = (await Promise.all(sources.map((s) => s.listSets(session.parcel_id)))).flat();
  const set = sets.find((s) => s.sessionId === session.id) ?? null;
  const panoramas: ApprovalPanorama[] = set
    ? ((await sourceOfSet(sources, set.id)?.listPanoramas(set.id)) ?? []).map((p) => ({
        id: p.id,
        lat: p.lat,
        lon: p.lon,
        headingDeg: p.headingDeg,
        hasPreview: p.variants.includes("2k"),
        hasFull: p.variants.includes("4k"),
      }))
    : [];

  const e = t.inventory.expert;
  const approved = session.status === "published";
  return (
    <main className={styles.page}>
      <p>
        <Link href="/uzman">← {e.back}</Link>
      </p>
      <div>
        <h1>{e.title(ws.parcel.name)}</h1>
        <p className="muted">
          {e.session(formatDate(sessionTime(session)), t.office.sessionStatus[session.status])}
        </p>
      </div>
      {approved && session.published_at && (
        <p className={styles.approved} data-testid="inventory-approved">
          {e.approvedBanner(formatDate(session.published_at))}
        </p>
      )}
      <InventorySummaryView summary={summary} />
      <Checks checks={checks} />
      <InventoryApproval
        ws={ws}
        sessionId={session.id}
        flaggedSlotIds={flagged}
        panoramaSet={set?.id ?? null}
        panoramas={panoramas}
        coverage={await loadCoverage(supabase, session.id)}
      />
    </main>
  );
}

function flaggedSlots(slots: { id: string; code: string }[], checks: CodingChecks): string[] {
  const codes = new Set([
    ...checks.duplicateCodes.map((d) => d.code),
    ...checks.closeTrees.flatMap((c) => [c.a, c.b]),
  ]);
  return slots.filter((s) => codes.has(s.code)).map((s) => s.id);
}

function Checks({ checks }: { checks: CodingChecks }) {
  const c = t.inventory.expert.checks;
  return (
    <section className={styles.panel} data-testid="coding-checks">
      <h2>{c.title}</h2>
      {!hasCodingProblems(checks) ? (
        <p className={styles.success}>{c.ok}</p>
      ) : (
        <ul className={styles.list}>
          {checks.duplicateCodes.length > 0 && (
            <li data-testid="check-duplicates">
              {c.duplicateCodes}: {checks.duplicateCodes.map((d) => d.code).join(", ")}
            </li>
          )}
          {checks.skippedRows.length > 0 && (
            <li data-testid="check-rows">
              {c.skippedRows}: {checks.skippedRows.join(", ")}
            </li>
          )}
          {checks.skippedPositions.length > 0 && (
            <li data-testid="check-positions">
              {c.skippedPositions}:{" "}
              {checks.skippedPositions
                .map((r) => c.rowPositions(r.rowNo, r.positions.join(", ")))
                .join("; ")}
            </li>
          )}
          {checks.skippedSuffixes.length > 0 && (
            <li data-testid="check-suffixes">
              {c.skippedSuffixes}: {checks.skippedSuffixes.join(", ")}
            </li>
          )}
          {checks.closeTrees.length > 0 && (
            <li data-testid="check-close">
              {c.closeTrees(String(CLOSE_TREE_M).replace(".", ","))}:{" "}
              {checks.closeTrees
                .map((p) => c.pair(p.a, p.b, p.distanceM.toFixed(2).replace(".", ",")))
                .join("; ")}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
