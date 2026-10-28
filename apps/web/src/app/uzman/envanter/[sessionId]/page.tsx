import { notFound } from "next/navigation";
import {
  ApproveForm,
  CoverageDetails,
  InventoryApproval,
  type ApprovalPanorama,
} from "@/components/expert/inventory-approval";
import { InventorySummaryView } from "@/components/office/inventory-summary";
import { BoundaryPointers } from "@/components/operations/boundary-pointers";
import styles from "@/components/office/inventory.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
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
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { loadCoverage, type CoverageSummary } from "@/lib/expert/pipeline-checks";
import { loadInventoryWorkspace } from "@/lib/office/inventory-workspace";
import { listBoundaryPointers, type BoundaryPointer } from "@/lib/operations/legal";
import { officePanoramaSources } from "@/lib/office/panorama-source";
import { sourceOfSet } from "@/lib/office/panoramas";
import { createClient } from "@/lib/supabase/server";

const e = t.inventory.expert;

// Expert's inventory approval (MVP Module 2, step 10): what blocks the
// signature at the top next to the sign-off, then the coded map with a
// panorama for spot checks and the tree attributes, the verification tours,
// and the details (coding checks, coverage, summary, boundary pointer).
export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireSection("uzman");
  const { sessionId } = await params;
  const supabase = await createClient();
  // The coverage report only needs the session id: it loads with the session.
  const [session, coverage] = await Promise.all([
    getInventorySession(supabase, sessionId),
    loadCoverage(supabase, sessionId),
  ]);
  if (!session) notFound();

  // Everything else needs the parcel; these reads are independent.
  const sources = officePanoramaSources(supabase, user.id);
  const [ws, setLists, pointers] = await Promise.all([
    loadInventoryWorkspace(supabase, session.parcel_id),
    Promise.all(sources.map((s) => s.listSets(session.parcel_id))),
    listBoundaryPointers(supabase, session.parcel_id),
  ]);
  if (!ws) notFound();

  const checks = codingChecks(ws.slots);
  const summary = inventorySummary(ws.slots);
  const flagged = flaggedSlots(ws.slots, checks);

  // Panoramas of the inventory session for the spot check.
  const set = setLists.flat().find((s) => s.sessionId === session.id) ?? null;
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

  const approved = session.status === "published";
  const openItems = ws.tours.reduce(
    (n, tour) => n + tour.items.filter((i) => i.status === "open").length,
    0,
  );
  const coverageBlocked = !!coverage && !coverage.passed && !coverage.waivedAt;
  return (
    <main className={styles.page}>
      <PageHeader
        back={{ href: "/uzman", label: e.back }}
        title={e.title(ws.parcel.name)}
        meta={
          <>
            <Badge tone={STATUS_TONE[session.status] ?? "neutral"}>
              {t.office.sessionStatus[session.status]}
            </Badge>
            <span className={styles.hint}>{e.session(formatDate(sessionTime(session)))}</span>
          </>
        }
      />
      <div className={styles.gateRow}>
        <Gate checks={checks} coverage={coverage} openItems={openItems} pointers={pointers} />
        {approved ? (
          session.published_at && (
            <Alert tone="success" title={e.approve.title} testId="inventory-approved">
              <p>{e.approvedBanner(formatDate(session.published_at))}</p>
            </Alert>
          )
        ) : (
          <ApproveForm
            parcelId={ws.parcel.id}
            sessionId={session.id}
            openItems={openItems}
            coverageBlocked={coverageBlocked}
            noSlots={ws.slots.length === 0}
          />
        )}
      </div>
      <InventoryApproval
        ws={ws}
        sessionId={session.id}
        flaggedSlotIds={flagged}
        panoramaSet={set?.id ?? null}
        panoramas={panoramas}
      />
      <section className={styles.detailsSection} aria-labelledby="inventory-details">
        <h2 id="inventory-details" className={styles.sectionTitle}>
          {e.detailsTitle}
        </h2>
        <div className={styles.detailGrid}>
          <div className={styles.wide}>
            <InventorySummaryView summary={summary} />
          </div>
          <Checks checks={checks} />
          <CoverageDetails
            coverage={coverage}
            parcelId={ws.parcel.id}
            sessionId={session.id}
            approved={ws.approved}
          />
          <div id="sinir-gosteren" className={styles.pointers}>
            <BoundaryPointers pointers={pointers} />
          </div>
        </div>
      </section>
    </main>
  );
}

const STATUS_TONE: Partial<Record<string, BadgeTone>> = {
  in_review: "info",
  processed: "info",
  published: "success",
  cancelled: "danger",
};

function flaggedSlots(slots: { id: string; code: string }[], checks: CodingChecks): string[] {
  const codes = new Set([
    ...checks.duplicateCodes.map((d) => d.code),
    ...checks.closeTrees.flatMap((c) => [c.a, c.b]),
  ]);
  return slots.filter((s) => codes.has(s.code)).map((s) => s.id);
}

function problemCount(checks: CodingChecks): number {
  return (
    checks.duplicateCodes.length +
    checks.skippedRows.length +
    checks.skippedPositions.length +
    checks.skippedSuffixes.length +
    checks.closeTrees.length
  );
}

// At a glance: can the inventory be signed? Blocking items (open
// verification items, coverage below the threshold) are danger; warnings
// that do not block are warning.
function Gate({
  checks,
  coverage,
  openItems,
  pointers,
}: {
  checks: CodingChecks;
  coverage: CoverageSummary | null;
  openItems: number;
  pointers: BoundaryPointer[];
}) {
  const g = e.gate;
  const pct = (x: number) => formatNumber(x * 100, 1);
  const items: {
    key: string;
    label: string;
    href: string;
    value: string;
    tone: BadgeTone;
    note?: string;
  }[] = [
    hasCodingProblems(checks)
      ? {
          key: "coding",
          label: g.coding,
          href: "#kodlama",
          value: g.codingProblems(problemCount(checks)),
          tone: "warning",
          note: g.warning,
        }
      : { key: "coding", label: g.coding, href: "#kodlama", value: g.codingOk, tone: "success" },
    !coverage
      ? {
          key: "coverage",
          label: g.coverage,
          href: "#kapsama",
          value: g.coverageNone,
          tone: "neutral",
        }
      : coverage.passed
        ? {
            key: "coverage",
            label: g.coverage,
            href: "#kapsama",
            value: g.coveragePassed(pct(coverage.ratio)),
            tone: "success",
          }
        : coverage.waivedAt
          ? {
              key: "coverage",
              label: g.coverage,
              href: "#kapsama",
              value: g.coverageWaived,
              tone: "success",
            }
          : {
              key: "coverage",
              label: g.coverage,
              href: "#kapsama",
              value: g.coverageBelow(pct(coverage.ratio)),
              tone: "danger",
              note: g.blocking,
            },
    openItems > 0
      ? {
          key: "items",
          label: g.openItems,
          href: "#dogrulama",
          value: g.openItemsCount(openItems),
          tone: "danger",
          note: g.blocking,
        }
      : {
          key: "items",
          label: g.openItems,
          href: "#dogrulama",
          value: g.openItemsNone,
          tone: "success",
        },
    pointers.length > 0
      ? {
          key: "pointer",
          label: g.pointer,
          href: "#sinir-gosteren",
          value: g.pointerRecorded(pointers.length),
          tone: "success",
        }
      : {
          key: "pointer",
          label: g.pointer,
          href: "#sinir-gosteren",
          value: g.pointerNone,
          tone: "warning",
          note: g.warning,
        },
  ];
  return (
    <section className={styles.gate} aria-labelledby="approval-gate" data-testid="approval-gate">
      <h2 id="approval-gate">{g.title}</h2>
      <dl>
        {items.map((item) => (
          <div key={item.key} data-testid={`gate-${item.key}`}>
            <dt>
              <a href={item.href}>{item.label}</a>
            </dt>
            <dd>
              <Badge tone={item.tone}>{item.value}</Badge>
              {item.note && <span className={styles.gateNote}>{item.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Checks({ checks }: { checks: CodingChecks }) {
  const c = t.inventory.expert.checks;
  return (
    <section id="kodlama" className={styles.panel} data-testid="coding-checks">
      <h3>{c.title}</h3>
      {!hasCodingProblems(checks) ? (
        <p className={styles.hint}>{c.ok}</p>
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
